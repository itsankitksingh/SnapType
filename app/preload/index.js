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
  chooseSnippetApp: (snippetId) => ipcRenderer.invoke('snippet-app:choose', { snippetId }),
  pickSnippetApp: (snippetId) => ipcRenderer.invoke('snippet-app:pick-active', { snippetId }),
  removeSnippetApp: (snippetId, pathOrExe) =>
    ipcRenderer.invoke('snippet-app:remove', { snippetId, pathOrExe }),
  createFolder: (name) => ipcRenderer.invoke('folder:create', { name }),
  updateFolder: (id, patch) => ipcRenderer.invoke('folder:update', { id, patch }),
  deleteFolder: (id) => ipcRenderer.invoke('folder:delete', { id }),
  moveFolder: (id, direction) => ipcRenderer.invoke('folder:move', { id, direction }),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseAllowedApp: () => ipcRenderer.invoke('allowed-app:choose'),
  pickActiveApp: () => ipcRenderer.invoke('allowed-app:pick-active'),
  removeAllowedApp: (pathOrExe) => ipcRenderer.invoke('allowed-app:remove', { pathOrExe }),
  onStateChanged: (callback) => createListener('state:changed', callback),
  onPopupOpen: (callback) => createListener('popup:open', callback),
  submitPopup: (values) => ipcRenderer.invoke('popup:submit', values),
  cancelPopup: () => ipcRenderer.invoke('popup:cancel'),
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    hide: () => ipcRenderer.invoke('window:hide')
  }
});
