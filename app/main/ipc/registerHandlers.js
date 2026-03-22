const { BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');

const POPUP_HIDE_SETTLE_MS = 120;
const POPUP_FOCUS_POLL_MS = 60;
const POPUP_FOCUS_TIMEOUT_MS = 900;

function removeHandler(channel) {
  try {
    ipcMain.removeHandler(channel);
  } catch (error) {
    void error;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isSameApp(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftPath = (left.path || '').toLowerCase();
  const rightPath = (right.path || '').toLowerCase();

  if (leftPath && rightPath) {
    return leftPath === rightPath;
  }

  const leftExe = (left.exe || '').toLowerCase();
  const rightExe = (right.exe || '').toLowerCase();
  return Boolean(leftExe) && leftExe === rightExe;
}

async function waitForTargetAppFocus(targetApp, pollActiveApp, isOwnWindow) {
  await sleep(POPUP_HIDE_SETTLE_MS);

  if (!targetApp) {
    return;
  }

  const deadline = Date.now() + POPUP_FOCUS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const activeApp = await pollActiveApp();

    if (activeApp && !isOwnWindow(activeApp) && isSameApp(activeApp, targetApp)) {
      return;
    }

    await sleep(POPUP_FOCUS_POLL_MS);
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
    recordSnippetUsage,
    finishExpansion,
    getPendingExpansion,
    getRendererState
  } = context;
  const channels = [
    'app:getState',
    'snippet:create',
    'snippet:update',
    'snippet:delete',
    'snippet-app:choose',
    'snippet-app:pick-active',
    'snippet-app:remove',
    'folder:create',
    'folder:update',
    'folder:delete',
    'folder:move',
    'settings:update',
    'allowed-app:choose',
    'allowed-app:pick-active',
    'allowed-app:remove',
    'popup:submit',
    'popup:cancel',
    'window:minimize',
    'window:toggle-maximize',
    'window:hide'
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

  ipcMain.handle('snippet-app:choose', async (_event, payload) => {
    try {
      if (!payload?.snippetId) {
        throw new Error('Snippet not found.');
      }

      const result = await dialog.showOpenDialog(windows.mainWindow, {
        title: 'Choose an application for this snippet',
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
      store.addSnippetAllowedApp(payload.snippetId, allowedApp);
      return wrapResult({ app: allowedApp, snippetId: payload.snippetId });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('snippet-app:pick-active', async (_event, payload) => {
    try {
      if (!payload?.snippetId) {
        throw new Error('Snippet not found.');
      }

      const activeApp = await pollActiveApp();

      if (!activeApp || isOwnWindow(activeApp)) {
        throw new Error('Switch to the target app before the countdown ends.');
      }

      const allowedApp = await buildAllowedApp({ app, windowInfo: activeApp });
      store.addSnippetAllowedApp(payload.snippetId, allowedApp);
      return wrapResult({ app: allowedApp, snippetId: payload.snippetId });
    } catch (error) {
      return wrapError(error);
    }
  });

  ipcMain.handle('snippet-app:remove', async (_event, payload) => {
    try {
      store.removeSnippetAllowedApp(payload?.snippetId, payload?.pathOrExe);
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

  ipcMain.handle('folder:move', async (_event, payload) => {
    try {
      store.moveFolder(payload?.id, payload?.direction);
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
      const text = `${resolvePlaceholders(pendingExpansion.snippet.body, values)}${pendingExpansion.trailingText || ''}`;
      windows.hidePopup();
      await waitForTargetAppFocus(pendingExpansion.targetApp, pollActiveApp, isOwnWindow);
      await typeExpandedText(text);
      recordSnippetUsage?.(pendingExpansion.snippet.id);
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

  ipcMain.handle('window:minimize', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return { ok: true };
  });

  ipcMain.handle('window:toggle-maximize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }

    return { ok: true };
  });

  ipcMain.handle('window:hide', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide();
    return { ok: true };
  });
}

module.exports = {
  registerIpcHandlers
};
