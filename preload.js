const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  getLogs: () => ipcRenderer.invoke("get-logs"),
  clearLogs: () => ipcRenderer.invoke("clear-logs"),
  testPrint: () => ipcRenderer.invoke("test-print"),
  getTemplates: () => ipcRenderer.invoke("get-templates"),
  saveTemplate: (type, template) => ipcRenderer.invoke("save-template", { type, template }),
  connectPrinter: (ip) => ipcRenderer.invoke("connect-printer", ip),
  connectSocket: (url) => ipcRenderer.invoke("connect-socket", url),
  onPrinterStatus: (callback) => {
    ipcRenderer.on("printer-status-update", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("printer-status-update");
  },
  onSocketStatus: (callback) => {
    ipcRenderer.on("socket-status-update", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("socket-status-update");
  }
});
