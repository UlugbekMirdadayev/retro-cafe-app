const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Функции управления окном
  windowControls: {
    minimize: () => ipcRenderer.invoke("window-minimize"),
    maximize: () => ipcRenderer.invoke("window-maximize"),
    close: () => ipcRenderer.invoke("window-close"),
  },
  // Функции локализации
  localization: {
    translate: (key) => ipcRenderer.invoke("translate", key),
    getCurrentLanguage: () => ipcRenderer.invoke("get-current-language"),
    changeLanguage: (lang) => ipcRenderer.invoke("change-language", lang),
    getAvailableLanguages: () => ipcRenderer.invoke("get-available-languages"),
  },
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  getLogs: () => ipcRenderer.invoke("get-logs"),
  clearLogs: () => ipcRenderer.invoke("clear-logs"),
  testPrint: () => ipcRenderer.invoke("test-print"),
  testTemplate: () => ipcRenderer.invoke("test-template"),
  getTemplates: () => ipcRenderer.invoke("get-templates"),
  saveTemplates: (templates) => ipcRenderer.invoke("save-templates", templates),
  saveTemplate: (type, template) => ipcRenderer.invoke("save-template", { type, template }),
  printTemplatePreview: (template, templateSettings) => ipcRenderer.invoke("print-template-preview", template, templateSettings),
  connectPrinter: (ip) => ipcRenderer.invoke("connect-printer", ip),
  connectSocket: (url) => ipcRenderer.invoke("connect-socket", url),
  updateSocketStatus: (status) => ipcRenderer.invoke("update-socket-status", status),
  // New socket and template functions
  logEvent: (eventData) => ipcRenderer.invoke("log-event", eventData),
  processTemplate: (templateId, data) => ipcRenderer.invoke("process-template", templateId, data),
  onPrinterStatus: (callback) => {
    ipcRenderer.on("printer-status-update", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("printer-status-update");
  },
  onSocketStatus: (callback) => {
    console.log("=== PRELOAD: Setting up socket status listener ===");
    ipcRenderer.on("socket-status-update", (event, data) => {
      console.log("=== PRELOAD: Received socket-status-update ===");
      console.log("Event:", event);
      console.log("Data:", JSON.stringify(data, null, 2));
      callback(data);
    });
    return () => {
      console.log("=== PRELOAD: Removing socket status listener ===");
      ipcRenderer.removeAllListeners("socket-status-update");
    };
  },
  onWindowMaximizedChange: (callback) => {
    ipcRenderer.on("window-maximized-change", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("window-maximized-change");
  }
});
