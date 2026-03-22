const { contextBridge, ipcRenderer } = require('electron');

function createListener(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('snaptype', {
  getState: () => ipcRenderer.invoke('app:getState'),
  createSnippet: (folderId) => ipcRenderer.invoke('snippet:create', { folderId }),
  updateSnippet: (id, patch) => ipcRenderer.invoke('snippet:update', { id, patch }),
  deleteSnippet: (id) => ipcRenderer.invoke('snippet:delete', { id }),
  createFolder: (name) => ipcRenderer.invoke('folder:create', { name }),
  updateFolder: (id, patch) => ipcRenderer.invoke('folder:update', { id, patch }),
  deleteFolder: (id) => ipcRenderer.invoke('folder:delete', { id }),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseAllowedApp: () => ipcRenderer.invoke('allowed-app:choose'),
  pickActiveApp: () => ipcRenderer.invoke('allowed-app:pick-active'),
  removeAllowedApp: (pathOrExe) => ipcRenderer.invoke('allowed-app:remove', { pathOrExe }),
  onStateChanged: (callback) => createListener('state:changed', callback),
  onPopupOpen: (callback) => createListener('popup:open', callback),
  submitPopup: (values) => ipcRenderer.invoke('popup:submit', values),
  cancelPopup: () => ipcRenderer.invoke('popup:cancel')
});
