const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const io = require("socket.io-client");
const settings = require("./settings");
const printer = require("./printer");
const logManager = require("./logManager");
const templateManager = require("./templateManager");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "ui/index.html"));
}

app.whenReady().then(() => {
  createWindow();
  connectSocket();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Socket connection
function connectSocket(url) {
  url = url || settings.getSettings().socketUrl || "http://localhost:3000";
  
  const socket = io(url, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity
  });

  // Обновляем статус сокета
  const updateStatus = (status, details) => {
    if (mainWindow) {
      mainWindow.webContents.send("socket-status-update", { status, details });
    }
  };

  socket.on("connect", () => {
    console.log("Socket connected");
    updateStatus("connected");
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    updateStatus("disconnected");
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    updateStatus("error", error.message);
  });

  socket.on("new_order", (data) => {
    console.log("Received new_order:", data);
    // Убедимся, что данные не undefined или null
    if (data) {
      console.log("Processing order data:", JSON.stringify(data));
      handlePrint("new_order", data);
    } else {
      console.error("Received empty order data");
    }
  });

  socket.on("new_service", (data) => {
    console.log("Received new_service:", data);
    handlePrint("new_service", data);
  });

  return socket;
}

async function handlePrint(type, data) {
  try {
    console.log(`Printing ${type} with data:`, JSON.stringify(data, null, 2));
    
    const template = templateManager.getTemplate(type);
    if (!template) {
      console.error(`Template for ${type} not found`);
      throw new Error(`Шаблон для типа '${type}' не найден`);
    }
    
    console.log(`Using template: ${template.name}`);
    
    // Добавляем дополнительную проверку данных
    if (!data.products || !Array.isArray(data.products)) {
      console.warn("Products array missing or invalid, using empty array");
      data.products = [];
    }
    
    if (!data.totalAmount || typeof data.totalAmount !== 'object') {
      console.warn("totalAmount missing or invalid, using default");
      data.totalAmount = { uzs: 0 };
    }
    
    await printer.printReceipt(template, data);
    console.log("Print receipt completed successfully");
    
    logManager.addLog(type, template.name, "success");
    
    if (mainWindow) {
      mainWindow.webContents.send("print-success", { type });
    }
  } catch (err) {
    console.error("Print error:", err);
    logManager.addLog(type, err.message, "error");
    
    if (mainWindow) {
      mainWindow.webContents.send("print-error", { type, error: err.message });
    }
  }
}

// IPC handlers
ipcMain.handle("save-settings", (_, newSettings) => {
  const result = settings.saveSettings(newSettings);
  return result;
});
ipcMain.handle("get-settings", () => settings.getSettings());
ipcMain.handle("get-logs", () => logManager.getLogs());
ipcMain.handle("clear-logs", () => logManager.clearLogs());
ipcMain.handle("test-print", () => printer.testPrint());
ipcMain.handle("get-templates", () => templateManager.loadTemplates());
ipcMain.handle("save-template", (_, { type, template }) => {
  templateManager.saveTemplate(type, template);
  return { success: true };
});
ipcMain.handle("connect-printer", async (_, ip) => {
  try {
    // Проверяем соединение с принтером
    const testResult = await printer.testConnection(ip);
    if (mainWindow) {
      mainWindow.webContents.send("printer-status-update", { status: "connected" });
    }
    return { success: true };
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send("printer-status-update", { 
        status: "error", 
        details: error.message 
      });
    }
    return { success: false, error: error.message };
  }
});
ipcMain.handle("connect-socket", (_, url) => {
  try {
    connectSocket(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
