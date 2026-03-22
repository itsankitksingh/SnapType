const path = require('node:path');
const { app, globalShortcut } = require('electron');
const { registerIpcHandlers } = require('./ipc/registerHandlers');
const {
  ACTIVE_APP_POLL_INTERVAL_MS,
  APP_NAME,
  BUFFER_SIZE,
  EXPANSION_SETTLE_DELAY_MS,
  HOOK_RESUME_DELAY_MS,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_DIR,
  TOGGLE_SHORTCUT_ACCELERATOR,
  TOGGLE_SHORTCUT_DISPLAY
} = require('./config/constants');
const {
  getCachedActiveApp,
  pollActiveApp,
  startActiveAppPolling,
  stopActiveAppPolling
} = require('./services/activeAppService');
const {
  eraseShortcut,
  extractPlaceholders,
  resolvePlaceholders,
  typeExpandedText
} = require('./services/expanderService');
const { GlobalShortcutHook } = require('./services/hookService');
const { buildAllowedApp } = require('./services/iconService');
const { SnapTypeStore } = require('./services/snaptypeStore');
const { createTray } = require('./system/trayManager');
const { WindowManager } = require('./system/windowManager');

let tray = null;
let store = null;
let windows = null;
let hook = null;
let pendingExpansion = null;
let isExpanding = false;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

app.setName(APP_NAME);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function getRendererState() {
  return {
    state: store.getSnapshot(),
    meta: {
      version: app.getVersion(),
      toggleShortcut: TOGGLE_SHORTCUT_DISPLAY
    }
  };
}

function broadcastState() {
  windows.sendState(getRendererState());
}

function applyLaunchOnStartup(enabled) {
  if (process.platform !== 'win32') {
    return;
  }

  if (!app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false });
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath
  });
}

function isOwnWindow(activeApp) {
  if (!activeApp) {
    return false;
  }

  const activePath = (activeApp.path || '').toLowerCase();
  const execPath = process.execPath.toLowerCase();

  return Boolean(activePath) && activePath === execPath;
}

function canExpandForActiveApp(activeApp) {
  if (isOwnWindow(activeApp)) {
    return false;
  }

  const { settings } = store.getSnapshot();

  if (settings.activeIn.mode !== 'allowlist') {
    return true;
  }

  const activePath = (activeApp?.path || '').toLowerCase();
  const activeExe = (activeApp?.exe || '').toLowerCase();

  return settings.activeIn.apps.some((allowedApp) => {
    const allowedPath = (allowedApp.path || '').toLowerCase();
    const allowedExe = (allowedApp.exe || '').toLowerCase();

    if (allowedPath && activePath) {
      return allowedPath === activePath;
    }

    return allowedExe && activeExe && allowedExe === activeExe;
  });
}

function finishExpansion() {
  pendingExpansion = null;
  isExpanding = false;
  hook.resume({
    clearBuffer: true,
    suppressForMs: HOOK_RESUME_DELAY_MS
  });
}

async function showPlaceholderPopup(snippet, placeholders) {
  pendingExpansion = { snippet, placeholders };
  isExpanding = false;
  await windows.showPopup({
    shortcut: snippet.shortcut,
    body: snippet.body,
    placeholders
  });
}

async function handleShortcutMatch(snippet) {
  if (!snippet || isExpanding || pendingExpansion) {
    return;
  }

  const activeApp = getCachedActiveApp();

  if (!canExpandForActiveApp(activeApp)) {
    return;
  }

  isExpanding = true;
  hook.pause();
  hook.clearBuffer();

  try {
    await sleep(EXPANSION_SETTLE_DELAY_MS);
    const placeholders = extractPlaceholders(snippet.body);
    await eraseShortcut(snippet.shortcut.length);

    if (placeholders.length === 0) {
      await typeExpandedText(snippet.body);
      finishExpansion();
      return;
    }

    await showPlaceholderPopup(snippet, placeholders);
  } catch (error) {
    finishExpansion();
  }
}

async function createApplication() {
  store = await SnapTypeStore.create();
  windows = new WindowManager({
    rendererDir: RENDERER_DIR,
    preloadPath: PRELOAD_PATH,
    iconPath: ICON_PATH
  });
  hook = new GlobalShortcutHook({ bufferSize: BUFFER_SIZE });

  registerIpcHandlers({
    app,
    store,
    windows,
    pollActiveApp,
    isOwnWindow,
    buildAllowedApp,
    typeExpandedText,
    resolvePlaceholders,
    finishExpansion,
    getPendingExpansion: () => pendingExpansion,
    getRendererState
  });

  await windows.ensureWindows();
  startActiveAppPolling(ACTIVE_APP_POLL_INTERVAL_MS);

  const shortcutIndex = store.getShortcutIndex();
  hook.setShortcutIndex(shortcutIndex.shortcutMap, shortcutIndex.shortcutLengths);
  hook.on('shortcut', (snippet) => {
    void handleShortcutMatch(snippet);
  });
  hook.start();

  store.on('changed', ({ state, shortcutMap, shortcutLengths }) => {
    hook.setShortcutIndex(shortcutMap, shortcutLengths);
    applyLaunchOnStartup(state.settings.launchOnStartup);
    broadcastState();
  });

  applyLaunchOnStartup(store.getSnapshot().settings.launchOnStartup);
  broadcastState();

  globalShortcut.register(TOGGLE_SHORTCUT_ACCELERATOR, () => {
    windows.toggleMainWindow();
  });

  tray = createTray({
    iconPath: ICON_PATH,
    onToggleWindow: () => windows.toggleMainWindow(),
    onQuit: () => app.quit()
  });
}

if (hasSingleInstanceLock) {
  app.whenReady().then(createApplication);
}

app.on('second-instance', () => {
  if (windows) {
    windows.showMainWindow();
  }
});

app.on('activate', () => {
  if (windows) {
    windows.showMainWindow();
  }
});

app.on('before-quit', () => {
  if (windows) {
    windows.setQuitting(true);
  }

  if (hook) {
    hook.stop();
  }

  globalShortcut.unregisterAll();
  stopActiveAppPolling();

  if (tray) {
    tray.destroy();
  }
});
