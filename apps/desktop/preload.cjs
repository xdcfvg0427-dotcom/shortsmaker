const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("paperDesktop", {
  settings: () => ipcRenderer.invoke("desktop:settings"),
  saveSettings: (value) => ipcRenderer.invoke("desktop:save-settings", value),
  chooseFolder: () => ipcRenderer.invoke("desktop:choose-folder"),
  openFolder: () => ipcRenderer.invoke("desktop:open-folder"),
});
