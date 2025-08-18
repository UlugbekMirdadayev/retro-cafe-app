const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const io = require("socket.io-client");
const settings = require("./settings");
const printer = require("./printer");
const logManager = require("./logManager");
const templateManager = require("./templateManager");
const localization = require("./localization");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    // frame: false, // Делаем окно безрамочным для собственного заголовка
    autoHideMenuBar: false,
    icon: path.join(__dirname, "ui/assets/favicon.png"), // Добавляем иконку приложения
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "ui/index.html"));

  // После загрузки обновляем статусы
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("=== WINDOW LOADED ===");
    console.log("Testing IPC communication...");

    // Тестируем IPC коммуникацию
    setTimeout(() => {
      if (
        mainWindow &&
        mainWindow.webContents &&
        !mainWindow.webContents.isDestroyed()
      ) {
        console.log("Sending test IPC message...");
        mainWindow.webContents.send("socket-status-update", {
          status: "test",
          details: "IPC test message",
          timestamp: Date.now(),
          force: true,
        });
        console.log("Test IPC message sent");
      }
    }, 1000);

    // Отправляем начальные статусы
    mainWindow.webContents.send("printer-status-update", {
      status: "disconnected",
    });
    mainWindow.webContents.send("socket-status-update", {
      status: "disconnected",
    });
    // Отправляем начальный статус максимизации окна
    mainWindow.webContents.send("window-maximized-change", {
      isMaximized: mainWindow.isMaximized(),
    });

    // Автоматически подключаемся к сокету при запуске
    const socketUrl = settings.getSettings().socketUrl;
    if (socketUrl) {
      console.log(`Auto-connecting to socket at ${socketUrl}`);
      connectSocket(socketUrl);
    }
  });

  // Отслеживаем изменения состояния максимизации окна
  mainWindow.on("maximize", () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("window-maximized-change", {
        isMaximized: true,
      });
    }
  });

  mainWindow.on("unmaximize", () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("window-maximized-change", {
        isMaximized: false,
      });
    }
  });
}

app.whenReady().then(() => {
  // Инициализируем систему локализации
  localization.initialize();

  createWindow();
  // Удаляем вызов connectSocket() отсюда, так как он уже вызывается в createWindow

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

  console.log(`Initializing socket connection to ${url}`);

  const socket = io(url, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    // Добавляем настройки для транспорта, сначала пробуем polling для совместимости
    transports: ["polling", "websocket"],
    // Расширенные настройки для решения проблем с CORS
    extraHeaders: {
      "Access-Control-Allow-Origin": "*",
    },
    // Не автоматически соединяться при создании
    autoConnect: false,
    // Для отладки - включаем подробный вывод
    debug: true,
  });

  // Обновляем статус сокета
  const updateStatus = (status, details) => {
    console.log(`Socket status updated: ${status}`, details ? details : "");
    console.log(`mainWindow exists: ${!!mainWindow}`);
    console.log(
      `webContents exists: ${!!(mainWindow && mainWindow.webContents)}`
    );
    console.log(
      `webContents destroyed: ${!!(mainWindow && mainWindow.webContents && mainWindow.webContents.isDestroyed())}`
    );

    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      try {
        const statusData = {
          status,
          details,
          timestamp: Date.now(),
          force: true,
        };
        console.log(
          "Sending status data:",
          JSON.stringify(statusData, null, 2)
        );

        // Отправляем событие с force флагом для принудительного обновления UI
        mainWindow.webContents.send("socket-status-update", statusData);

        // Проверяем что webContents может принимать события
        mainWindow.webContents
          .executeJavaScript(
            `
          console.log("=== MAIN TO RENDERER TEST ===");
          console.log("JavaScript executed from main process");
          console.log("Current location:", window.location.href);
          console.log("window.api exists:", typeof window.api);
          console.log("=== END TEST ===");
        `
          )
          .then(() => {
            console.log("JavaScript execution successful in renderer");
          })
          .catch((err) => {
            console.error("JavaScript execution failed in renderer:", err);
          });

        console.log(
          `Status message sent to renderer: ${status} (forced update)`
        );
      } catch (sendError) {
        console.error("Error sending status update:", sendError);
      }
    } else {
      console.warn(
        "mainWindow or webContents is null/destroyed, can't send socket status update"
      );
      if (mainWindow) {
        console.log(
          "mainWindow exists but webContents is:",
          mainWindow.webContents
        );
      }
    }
  };

  // Начальный статус "connecting"
  updateStatus("connecting");

  // Установка обработчиков перед подключением
  socket.on("connect", () => {
    console.log("Socket connected successfully!");
    // Обновляем статус только один раз
    updateStatus("connected", "Connection established successfully");
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    // Немедленно обновляем статус
    updateStatus("disconnected", "Connection closed");
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    // Более подробное сообщение об ошибке
    const errorDetails = error.message || "Connection failed";
    console.log(`Socket connection error details: ${errorDetails}`);

    // Немедленно обновляем статус
    updateStatus("error", `Connection error: ${errorDetails}`);
  });

  socket.on("error", (error) => {
    console.error("Socket general error:", error);
    // Более подробное сообщение об ошибке
    const errorDetails = error.message || "Socket error";
    console.log(`Socket error details: ${errorDetails}`);

    // Немедленно обновляем статус
    updateStatus("error", `Socket error: ${errorDetails}`);
  });

  // Проверяем доступность сервера перед подключением
  console.log(`Testing server availability at ${url} before connecting...`);

  // Функция для проверки доступности сервера
  const checkServerAvailability = () => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Server availability check timed out"));
      }, 5000);

      // Используем обычный HTTP запрос для проверки
      const http = require("http");
      const https = require("https");

      try {
        // Определяем, какой протокол использовать
        const client = url.startsWith("https:") ? https : http;
        const parsedUrl = new URL(url);

        // Делаем HEAD запрос для проверки доступности
        const req = client.request(
          {
            method: "HEAD",
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname || "/",
            timeout: 5000,
          },
          (res) => {
            clearTimeout(timeoutId);
            // Если получили какой-то ответ - сервер доступен
            resolve(true);
          }
        );

        req.on("error", (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });

        req.end();
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  };

  // Попытка подключения
  try {
    // Сначала проверяем доступность сервера
    checkServerAvailability()
      .then(() => {
        console.log("Server is available, attempting to connect socket");

        // Устанавливаем статус "connecting" перед подключением для надежности
        updateStatus("connecting", "Подключение к доступному серверу");

        // Пытаемся установить соединение
        socket.connect();

        // Если через 5 секунд статус не изменился, значит соединение зависло
        setTimeout(() => {
          if (!socket.connected) {
            console.warn("Socket connection timeout, forcing status update");
            updateStatus("error", "Таймаут подключения к серверу");
          }
        }, 5000);
      })
      .catch((err) => {
        console.error("Server availability check failed:", err.message);
        updateStatus("error", `Сервер недоступен: ${err.message}`);
      });
  } catch (error) {
    console.error("Error during socket connection attempt:", error);
    updateStatus(
      "error",
      `Ошибка подключения: ${error.message || "Неизвестная ошибка"}`
    );
  }

  socket.on("new_order", (data) => {
    console.log("Received new_order event");
    // Обрабатываем полученные данные безопасно
    try {
      if (!data) {
        console.error("Received empty order data");
        return;
      }

      // Попытка обработать данные как строку JSON, если это необходимо
      let orderData = data;
      if (typeof data === "string") {
        try {
          orderData = JSON.parse(data);
        } catch (e) {
          console.error("Error parsing order data as JSON:", e);
          console.log("Raw data received:", data);
          return;
        }
      }

      console.log("Processing order data:", JSON.stringify(orderData, null, 2));
      handlePrint("new_order", orderData);
    } catch (error) {
      console.error("Error processing new_order event:", error);
    }
  });

  socket.on("new_service", (data) => {
    console.log("Received new_service event");
    try {
      if (!data) {
        console.error("Received empty service data");
        return;
      }

      // Попытка обработать данные как строку JSON, если это необходимо
      let serviceData = data;
      if (typeof data === "string") {
        try {
          serviceData = JSON.parse(data);
        } catch (e) {
          console.error("Error parsing service data as JSON:", e);
          console.log("Raw data received:", data);
          return;
        }
      }

      console.log(
        "Processing service data:",
        JSON.stringify(serviceData, null, 2)
      );
      handlePrint("new_service", serviceData);
    } catch (error) {
      console.error("Error processing new_service event:", error);
    }
  });

  return socket;
}

async function handlePrint(type, data) {
  try {
    let logData;
    try {
      // Безопасное преобразование данных в JSON для логирования
      logData = JSON.stringify(data, null, 2);
    } catch (jsonErr) {
      logData = "<не удалось преобразовать в JSON>";
      console.warn("Error stringifying print data:", jsonErr);
    }

    console.log(`Printing ${type} with data:`, logData);

    // Получаем шаблон
    const template = templateManager.getTemplate(type);
    if (!template) {
      console.error(`Template for ${type} not found`);
      throw new Error(`Шаблон для типа '${type}' не найден`);
    }

    console.log(`Using template: ${template.name}`);

    // Создаем копию данных чтобы избежать их изменения
    const printData = { ...data };

    // Добавляем дополнительную проверку данных
    if (!printData.products || !Array.isArray(printData.products)) {
      console.warn("Products array missing or invalid, using empty array");
      printData.products = [];
    }

    if (!printData.totalAmount || typeof printData.totalAmount !== "object") {
      console.warn("totalAmount missing or invalid, using default");
      printData.totalAmount = { uzs: 0 };
    }

    // Выполняем печать
    await printer.printReceipt(template, printData);
    console.log("Print receipt completed successfully");

    // Логируем успех
    logManager.addLog(type, template.name, "success");

    // Отправляем успешный статус в UI
    if (mainWindow) {
      mainWindow.webContents.send("print-success", { type });
    }
  } catch (err) {
    console.error("Print error:", err);

    // Логируем ошибку
    const errorMessage = err.message || "Неизвестная ошибка печати";
    logManager.addLog(type, errorMessage, "error");

    // Отправляем сообщение об ошибке в UI
    if (mainWindow) {
      mainWindow.webContents.send("print-error", { type, error: errorMessage });
    }
  }
}

// IPC handlers для управления окном
ipcMain.handle("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
  return true;
});

ipcMain.handle("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return true;
});

ipcMain.handle("window-close", () => {
  if (mainWindow) mainWindow.close();
  return true;
});

// IPC handlers для локализации
ipcMain.handle("translate", (_, key) => {
  return localization.translate(key);
});

ipcMain.handle("get-current-language", () => {
  return localization.getCurrentLanguage();
});

ipcMain.handle("change-language", async (_, lang) => {
  // Меняем язык в локализации
  localization.setLanguage(lang);

  // Обновляем настройки
  const currentSettings = settings.getSettings();
  await settings.saveSettings({ ...currentSettings, language: lang });

  // Отправляем событие об изменении языка в рендерер
  if (mainWindow) {
    mainWindow.webContents.send("language-changed", { language: lang });
  }

  return true;
});

ipcMain.handle("get-available-languages", () => {
  return localization.getAvailableLanguages();
});

// IPC handlers
ipcMain.handle("save-settings", (_, newSettings) => {
  const result = settings.saveSettings(newSettings);
  return result;
});
ipcMain.handle("get-settings", () => settings.getSettings());
ipcMain.handle("get-logs", () => logManager.getLogs());
ipcMain.handle("clear-logs", () => logManager.clearLogs());
ipcMain.handle("test-print", async () => {
  try {
    console.log('Starting test print from main process...');
    const result = await printer.testPrint();
    
    logManager.addLog('test_print', 'success', 'success', 'Test print completed successfully');
    
    return { 
      success: true, 
      message: 'Test print completed successfully',
      userMessage: 'Test chop muvaffaqiyatli bajarildi',
      result 
    };
  } catch (error) {
    console.error('Test print error:', error);
    
    logManager.addLog('test_print', 'error', 'error', error.message || 'Test print failed');
    
    // Handle structured errors from printer utils
    if (error.type) {
      return { 
        success: false, 
        error: error.message,
        userMessage: error.userMessage,
        type: error.type
      };
    }
    
    // Handle legacy errors
    return { 
      success: false, 
      error: error.message || 'Unknown test print error',
      userMessage: 'Test chop etishda xatolik yuz berdi'
    };
  }
});

ipcMain.handle("test-template", async () => {
  try {
    console.log('Starting template test from main process...');
    const result = printer.testTemplateProcessing();
    console.log('Template test result:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      logManager.addLog('template_test', 'success', 'success', 'Template validation successful');
    } else {
      logManager.addLog('template_test', 'warning', 'warning', result.message || 'Template validation failed');
    }
    
    return result;
  } catch (error) {
    console.error('Template test error:', error);
    console.error('Error stack:', error.stack);
    
    logManager.addLog('template_test', 'error', 'error', error.message || 'Template test failed');
    
    // Handle structured errors from printer utils
    if (error.type) {
      return { 
        success: false, 
        message: error.message,
        userMessage: error.userMessage,
        type: error.type,
        error: error
      };
    }
    
    // Handle legacy errors
    return { 
      success: false, 
      message: error.message || 'Unknown template processing error',
      userMessage: 'Shablon tekshirishda xatolik yuz berdi',
      error: error.message
    };
  }
});

ipcMain.handle("get-templates", () => templateManager.loadTemplates());
ipcMain.handle("save-templates", (_, templates) => {
  templateManager.saveTemplates(templates);
  return { success: true };
});
ipcMain.handle("save-template", (_, { type, template }) => {
  templateManager.saveTemplate(type, template);
  return { success: true };
});
ipcMain.handle(
  "print-template-preview",
  async (_, template, templateSettings) => {
    try {
      // Используем тестовые данные для предварительного просмотра
      const testData = printer.getTestTemplateData();

      // Генерируем текстовый предварительный просмотр с форматированием
      const previewText = printer.previewTemplate(
        template,
        testData,
        templateSettings
      );

      return { success: true, previewText };
    } catch (error) {
      console.error("Error generating template preview:", error);
      return {
        success: false,
        error:
          error.message || "Неизвестная ошибка при предварительном просмотре",
        previewText: "Ошибка предварительного просмотра шаблона",
      };
    }
  }
);
ipcMain.handle("connect-printer", async (_, ip) => {
  console.log("=== PRINTER CONNECTION START ===");
  console.log("IP received:", ip);

  try {
    // Send connecting status
    console.log("Sending connecting status...");
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send("printer-status-update", {
        status: "connecting",
        timestamp: Date.now(),
      });
      console.log("Connecting status sent");
    }

    // Test printer connection with improved error handling
    console.log("Testing printer connection...");
    const testResult = await printer.testConnection(ip);
    console.log("Printer test result:", testResult);

    // Save settings if connection successful
    settings.saveSettings({
      ...settings.getSettings(),
      printerIp: ip,
    });
    console.log("Printer IP saved to settings");

    // Send connected status
    console.log("Sending connected status...");
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send("printer-status-update", {
        status: "connected",
        timestamp: Date.now(),
      });
      console.log("Connected status sent");
    }

    logManager.addLog('printer_connection', 'success', 'success', `Connected to printer at ${ip}`);
    
    console.log("=== PRINTER CONNECTION SUCCESS ===");
    return { 
      success: true,
      message: 'Printer connection successful',
      userMessage: 'Printer muvaffaqiyatli ulandi'
    };
    
  } catch (error) {
    console.error("=== PRINTER CONNECTION ERROR ===");
    console.error("Error connecting to printer:", error);
    
    // Send error status
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      const errorDetails = error.userMessage || error.message || 'Connection failed';
      mainWindow.webContents.send("printer-status-update", {
        status: "error",
        details: errorDetails,
        timestamp: Date.now(),
      });
      console.log("Error status sent");
    }

    logManager.addLog('printer_connection', 'error', 'error', error.message || 'Connection failed');
    
    console.log("=== PRINTER CONNECTION FAILED ===");
    
    // Handle structured errors from printer utils
    if (error.type) {
      return { 
        success: false, 
        error: error.message,
        userMessage: error.userMessage,
        type: error.type
      };
    }
    
    // Handle legacy errors
    return { 
      success: false, 
      error: error.message || 'Unknown connection error',
      userMessage: 'Printerga ulanishda xatolik yuz berdi'
    };
  }
});
ipcMain.handle("connect-socket", (_, url) => {
  console.log("=== SOCKET CONNECTION START ===");
  console.log("URL received:", url);

  try {
    if (!url || typeof url !== "string" || !url.trim()) {
      throw new Error("Некорректный URL сервера");
    }

    const cleanUrl = url.trim();
    console.log("Clean URL:", cleanUrl);

    // Проверка формата URL
    try {
      new URL(cleanUrl);
    } catch (e) {
      throw new Error("Неверный формат URL");
    }

    // Обновляем настройки
    settings.saveSettings({
      ...settings.getSettings(),
      socketUrl: cleanUrl,
    });
    console.log("Socket URL saved to settings");

    console.log(`Connecting to socket at URL: ${cleanUrl}`);

    // Отправляем статус "connecting"
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send("socket-status-update", {
        status: "connecting",
        timestamp: Date.now(),
      });
      console.log("Connecting status sent to renderer");
    }

    // Пробуем подключиться
    connectSocket(cleanUrl);

    console.log("=== SOCKET CONNECTION INITIATED ===");
    return { success: true };
  } catch (error) {
    console.error("=== SOCKET CONNECTION ERROR ===");
    console.error("Error in connect-socket handler:", error);
    if (
      mainWindow &&
      mainWindow.webContents &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send("socket-status-update", {
        status: "error",
        details: error.message || "Ошибка подключения",
        timestamp: Date.now(),
      });
      console.log("Error status sent to renderer");
    }
    console.log("=== SOCKET CONNECTION FAILED ===");
    return { success: false, error: error.message || "Ошибка подключения" };
  }
});

// IPC handlers for socket message logging and template processing
ipcMain.handle("log-event", async (_, eventData) => {
  try {
    logManager.addLog(
      eventData.type || 'socket_message',
      eventData.event || 'unknown',
      'info',
      JSON.stringify(eventData.data || {})
    );
    return { success: true };
  } catch (error) {
    console.error("Error logging event:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle("process-template", async (_, templateId, data) => {
  try {
    const template = templateManager.getTemplateById(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }
    
    // Process the template with the provided data
    await printer.printReceipt(template, data);
    
    // Log the successful processing
    logManager.addLog('template_processed', template.name, 'success');
    
    return { success: true };
  } catch (error) {
    console.error("Error processing template:", error);
    logManager.addLog('template_error', templateId, 'error', error.message);
    return { success: false, error: error.message };
  }
});

// Новый обработчик для обновления статуса сокета из renderer
ipcMain.handle("update-socket-status", (_, status) => {
  try {
    console.log(`Updating socket status from renderer: ${status}`);
    if (mainWindow) {
      mainWindow.webContents.send("socket-status-update", { status });
    }
    return { success: true };
  } catch (error) {
    console.error("Error updating socket status:", error);
    return { success: false, error: error.message };
  }
});
