const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bcrag', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: value => ipcRenderer.invoke('settings:set', value),
  openWebsite: () => ipcRenderer.invoke('website:open'),
  request: (route, method = 'GET', body = null) =>
    ipcRenderer.invoke('api:request', { route, method, body })
});
