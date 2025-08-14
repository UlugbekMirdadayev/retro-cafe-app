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
function connectSocket() {
  const socket = io("http://localhost:3000"); // server address

  socket.on("new_order", (data) => {
    handlePrint("new_order", data);
  });

  socket.on("new_service", (data) => {
    handlePrint("new_service", data);
  });
}

async function handlePrint(type, data) {
  try {
    const template = templateManager.getTemplate(type);
    await printer.printReceipt(template, data);
    logManager.addLog(type, template.name, "success");
  } catch (err) {
    logManager.addLog(type, null, "error");
  }
}

// IPC handlers
ipcMain.handle("save-settings", (_, newSettings) =>
  settings.saveSettings(newSettings)
);
ipcMain.handle("get-settings", () => settings.getSettings());
ipcMain.handle("get-logs", () => logManager.getLogs());
ipcMain.handle("clear-logs", () => logManager.clearLogs());
ipcMain.handle("test-print", () => printer.testPrint());
