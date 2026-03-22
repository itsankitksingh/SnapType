const { dialog, ipcMain } = require('electron');
const path = require('node:path');

function removeHandler(channel) {
  try {
    ipcMain.removeHandler(channel);
  } catch (error) {
    void error;
  }
}

function registerIpcHandlers(context) {
  const {
    app,
    store,
    windows,
    pollActiveApp,
    isOwnWindow,
    buildAllowedApp,
    typeExpandedText,
    resolvePlaceholders,
    finishExpansion,
    getPendingExpansion,
    getRendererState
  } = context;
  const channels = [
    'app:getState',
    'snippet:create',
    'snippet:update',
    'snippet:delete',
    'folder:create',
    'folder:update',
    'folder:delete',
    'settings:update',
    'allowed-app:choose',
    'allowed-app:pick-active',
    'allowed-app:remove',
    'popup:submit',
    'popup:cancel'
  ];

  channels.forEach(removeHandler);

  function wrapResult(extra = {}) {
    return {
      ok: true,
      ...getRendererState(),
      ...extra
    };
  }

  function wrapError(error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Something went wrong.',
      ...getRendererState()
    };
  }

  ipcMain.handle('app:getState', async () => getRendererState());

  ipcMain.handle('snippet:create', async (_event, payload) => {
    try {
      const result = store.createSnippet(payload?.folderId);
      return wrapResult({ snippet: result.snippet });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('snippet:update', async (_event, payload) => {
    try {
      store.updateSnippet(payload?.id, payload?.patch);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('snippet:delete', async (_event, payload) => {
    try {
      store.deleteSnippet(payload?.id);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('folder:create', async (_event, payload) => {
    try {
      const result = store.createFolder(payload?.name);
      return wrapResult({ folder: result.folder });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('folder:update', async (_event, payload) => {
    try {
      store.updateFolder(payload?.id, payload?.patch);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('folder:delete', async (_event, payload) => {
    try {
      store.deleteFolder(payload?.id);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('settings:update', async (_event, payload) => {
    try {
      store.updateSettings(payload);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('allowed-app:choose', async () => {
    try {
      const result = await dialog.showOpenDialog(windows.mainWindow, {
        title: 'Choose an application',
        filters: [{ name: 'Applications', extensions: ['exe'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return wrapResult({ canceled: true });
      }

      const executablePath = result.filePaths[0];
      const allowedApp = await buildAllowedApp({
        app,
        windowInfo: {
          name: path.basename(executablePath, path.extname(executablePath)),
          exe: path.basename(executablePath),
          path: executablePath
        }
      });
      store.addAllowedApp(allowedApp);
      return wrapResult({ app: allowedApp });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('allowed-app:pick-active', async () => {
    try {
      const activeApp = await pollActiveApp();

      if (!activeApp || isOwnWindow(activeApp)) {
        throw new Error('Switch to the target app before the countdown ends.');
      }

      const allowedApp = await buildAllowedApp({ app, windowInfo: activeApp });
      store.addAllowedApp(allowedApp);
      return wrapResult({ app: allowedApp });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('allowed-app:remove', async (_event, payload) => {
    try {
      store.removeAllowedApp(payload?.pathOrExe);
      return wrapResult();
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('popup:submit', async (_event, values) => {
    const pendingExpansion = getPendingExpansion();

    if (!pendingExpansion) {
      return wrapError(new Error('No placeholder expansion is pending.'));
    }

    try {
      const text = resolvePlaceholders(pendingExpansion.snippet.body, values);
      windows.hidePopup();
      await typeExpandedText(text);
      finishExpansion();
      return { ok: true };
    } catch (error) {
      finishExpansion();
      return wrapError(error);
    }
  });

  ipcMain.handle('popup:cancel', async () => {
    windows.hidePopup();
    finishExpansion();
    return { ok: true };
  });
}

module.exports = {
  registerIpcHandlers
};
