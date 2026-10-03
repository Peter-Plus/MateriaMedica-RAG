const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bcrag', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setServerUrl: value => ipcRenderer.invoke('settings:set', value),
  request: (route, method = 'GET', body = null) =>
    ipcRenderer.invoke('api:request', { route, method, body })
});
