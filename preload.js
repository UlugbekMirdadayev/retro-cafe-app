const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectBackend: () => ipcRenderer.invoke("select-backend"),
  startServer: () => ipcRenderer.invoke("start-server"),
  stopServer: () => ipcRenderer.invoke("stop-server"),
  getServerStatus: () => ipcRenderer.invoke("get-server-status"),
  checkServerHealth: () => ipcRenderer.invoke("check-server-health"),
  
  // Port boshqaruvi
  getActivePorts: () => ipcRenderer.invoke("get-active-ports"),
  getPortsWithProcesses: () => ipcRenderer.invoke("get-ports-with-processes"),
  getPortsWithProcessInfo: () => ipcRenderer.invoke("get-ports-with-process-info"),
  setPort: (port) => ipcRenderer.invoke("set-port", port),
  killPort: (port) => ipcRenderer.invoke("kill-port", port),
  
  onServerStatusChanged: (callback) => {
    ipcRenderer.on("server-status-changed", (event, data) => callback(data));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
