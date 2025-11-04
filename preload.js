const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  installGlobalFix: (appId) => ipcRenderer.invoke('install-globalfix', appId)
});
