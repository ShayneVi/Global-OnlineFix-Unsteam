const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  installGlobalFix: (appId, goldbergOptions) => ipcRenderer.invoke('install-globalfix', appId, goldbergOptions),
  unfixGame: (appId) => ipcRenderer.invoke('unfix-game', appId),
  fetchSteamApps: () => ipcRenderer.invoke('fetch-steam-apps'),
  fetchPCGamingWikiInfo: (appId) => ipcRenderer.invoke('fetch-pcgamingwiki-info', appId)
});
