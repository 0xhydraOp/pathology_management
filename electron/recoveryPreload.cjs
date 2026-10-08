const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('administratorRecovery', {
  select: () => ipcRenderer.invoke('recovery:select'),
  reset: (username, password, repeated, confirmation) => ipcRenderer.invoke('recovery:reset', username, password, repeated, confirmation)
});
