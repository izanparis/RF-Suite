const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rfDesktop', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke('rf-window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('rf-window-toggle-maximize'),
  close: () => ipcRenderer.invoke('rf-window-close'),
  onBackendExit: (callback) => {
    ipcRenderer.on('rf-backend-exit', (_event, payload) => callback(payload));
  },
});
