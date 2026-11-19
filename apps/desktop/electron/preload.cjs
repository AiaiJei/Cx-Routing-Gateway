const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  getWorkspace: () => ipcRenderer.invoke("runtime:get-workspace"),
  getStatus: () => ipcRenderer.invoke("runtime:get-status"),
  testUpstream: (id) => ipcRenderer.invoke("runtime:test-upstream", id),
  testRoute: (routeId, prompt) => ipcRenderer.invoke("runtime:test-route", routeId, prompt),
  createClientKey: (name, scope) => ipcRenderer.invoke("runtime:create-client-key", name, scope),
  rotateClientKey: (id) => ipcRenderer.invoke("runtime:rotate-client-key", id),
  revokeClientKey: (id) => ipcRenderer.invoke("runtime:revoke-client-key", id),
  createUpstream: (input) => ipcRenderer.invoke("runtime:create-upstream", input),
  deleteUpstream: (id) => ipcRenderer.invoke("runtime:delete-upstream", id),
  saveModelRoutes: selection => ipcRenderer.invoke("runtime:save-model-routes", selection),
  createRoute: (input) => ipcRenderer.invoke("runtime:create-route", input),
  deleteRoute: (id) => ipcRenderer.invoke("runtime:delete-route", id),
  updateRoute: (id, input) => ipcRenderer.invoke("runtime:update-route", id, input),
  updateSettings: (input) => ipcRenderer.invoke("runtime:update-settings", input),
  checkUpdate: () => ipcRenderer.invoke("runtime:check-update"),
  installUpdate: () => ipcRenderer.invoke("runtime:install-update"),
});
