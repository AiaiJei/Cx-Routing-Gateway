const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
});
