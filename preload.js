const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  installGlobalFix: (options) => ipcRenderer.invoke('install-globalfix', options),
  unfixGame: (options) => ipcRenderer.invoke('unfix-game', options),
  fetchSteamApps: () => ipcRenderer.invoke('fetch-steam-apps'),
  fetchPCGamingWikiInfo: (appId) => ipcRenderer.invoke('fetch-pcgamingwiki-info', appId)
});
