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
let expansionPause = {
  mode: 'running',
  resumesAt: null
};
let pauseTimer = null;

const PAUSE_FOR_15_MINUTES_MS = 15 * 60 * 1000;

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
  const pauseState = getExpansionPauseState();
  return {
    state: store.getSnapshot(),
    meta: {
      version: app.getVersion(),
      toggleShortcut: TOGGLE_SHORTCUT_DISPLAY,
      pauseState
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

function clearPauseTimer() {
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

function refreshTrayState() {
  tray?.refreshMenu?.();
}

function getExpansionPauseState() {
  if (expansionPause.mode === 'until-time' && expansionPause.resumesAt && Date.now() >= expansionPause.resumesAt) {
    expansionPause = {
      mode: 'running',
      resumesAt: null
    };
    clearPauseTimer();
  }

  return {
    mode: expansionPause.mode,
    resumesAt: expansionPause.resumesAt,
    isPaused: expansionPause.mode !== 'running'
  };
}

function updateExpansionPauseState(nextState) {
  expansionPause = nextState;
  refreshTrayState();
  if (windows) {
    broadcastState();
  }
}

function resumeExpansion() {
  clearPauseTimer();
  updateExpansionPauseState({
    mode: 'running',
    resumesAt: null
  });
}

function pauseExpansionFor(milliseconds) {
  clearPauseTimer();
  const resumesAt = Date.now() + milliseconds;
  pauseTimer = setTimeout(() => {
    resumeExpansion();
  }, milliseconds);
  updateExpansionPauseState({
    mode: 'until-time',
    resumesAt
  });
}

function pauseExpansionUntilRestart() {
  clearPauseTimer();
  updateExpansionPauseState({
    mode: 'until-restart',
    resumesAt: null
  });
}

function isExpansionPaused() {
  return getExpansionPauseState().isPaused;
}

function isOwnWindow(activeApp) {
  if (!activeApp) {
    return false;
  }

  const activePath = (activeApp.path || '').toLowerCase();
  const execPath = process.execPath.toLowerCase();

  return Boolean(activePath) && activePath === execPath;
}

function matchesAllowedApps(activeApp, allowedApps = []) {
  if (!activeApp) {
    return false;
  }

  const activePath = (activeApp?.path || '').toLowerCase();
  const activeExe = (activeApp?.exe || '').toLowerCase();

  return allowedApps.some((allowedApp) => {
    const allowedPath = (allowedApp.path || '').toLowerCase();
    const allowedExe = (allowedApp.exe || '').toLowerCase();

    if (allowedPath && activePath) {
      return allowedPath === activePath;
    }

    return allowedExe && activeExe && allowedExe === activeExe;
  });
}

function canExpandForActiveApp(snippet, activeApp) {
  if (isOwnWindow(activeApp)) {
    return false;
  }

  const { settings } = store.getSnapshot();

  if (settings.activeIn.mode === 'allowlist' && !matchesAllowedApps(activeApp, settings.activeIn.apps)) {
    return false;
  }

  const snippetActiveIn = snippet?.activeIn || { mode: 'all', apps: [] };

  if (snippetActiveIn.mode !== 'specific') {
    return true;
  }

  return matchesAllowedApps(activeApp, snippetActiveIn.apps);
}

function finishExpansion() {
  pendingExpansion = null;
  isExpanding = false;
  hook.resume({
    clearBuffer: true,
    suppressForMs: HOOK_RESUME_DELAY_MS
  });
}

async function showPlaceholderPopup(snippet, placeholders, activeApp, trailingText = '') {
  pendingExpansion = {
    snippet,
    placeholders,
    trailingText,
    targetApp: activeApp
      ? {
          name: activeApp.name || '',
          exe: activeApp.exe || '',
          path: activeApp.path || '',
          title: activeApp.title || ''
        }
      : null
  };
  isExpanding = false;
  await windows.showPopup({
    shortcut: snippet.shortcut,
    body: snippet.body,
    placeholders
  });
}

function recordSnippetUsage(snippetId) {
  if (!snippetId || !store) {
    return;
  }

  try {
    store.recordSnippetUsage(snippetId);
  } catch (error) {
    void error;
  }
}

async function handleShortcutMatch(match) {
  const snippet = match?.snippet || match;

  if (!snippet || isExpanding || pendingExpansion) {
    return;
  }

  if (isExpansionPaused()) {
    return;
  }

  const activeApp = getCachedActiveApp();

  if (!canExpandForActiveApp(snippet, activeApp)) {
    return;
  }

  isExpanding = true;
  hook.pause();
  hook.clearBuffer();

  try {
    await sleep(EXPANSION_SETTLE_DELAY_MS);
    const placeholders = extractPlaceholders(snippet.body);
    const eraseLength = Number.isFinite(match?.eraseLength) ? match.eraseLength : snippet.shortcut.length;
    const trailingText = typeof match?.trailingCharacter === 'string' ? match.trailingCharacter : '';
    await eraseShortcut(eraseLength);

    if (placeholders.length === 0) {
      await typeExpandedText(`${resolvePlaceholders(snippet.body, {})}${trailingText}`);
      recordSnippetUsage(snippet.id);
      finishExpansion();
      return;
    }

    await showPlaceholderPopup(snippet, placeholders, activeApp, trailingText);
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
    recordSnippetUsage,
    finishExpansion,
    getPendingExpansion: () => pendingExpansion,
    getRendererState
  });

  await windows.ensureWindows();
  startActiveAppPolling(ACTIVE_APP_POLL_INTERVAL_MS);

  const shortcutIndex = store.getShortcutIndex();
  hook.setShortcutIndex(shortcutIndex.shortcutMap, shortcutIndex.shortcutLengths);
  hook.on('shortcut', (match) => {
    void handleShortcutMatch(match);
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
    onPauseFor15Minutes: () => pauseExpansionFor(PAUSE_FOR_15_MINUTES_MS),
    onPauseUntilRestart: () => pauseExpansionUntilRestart(),
    onResumeExpansion: () => resumeExpansion(),
    getPauseState: () => getExpansionPauseState(),
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
  clearPauseTimer();

  if (tray) {
    tray.destroy();
  }
});
