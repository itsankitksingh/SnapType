const path = require('node:path');

let cachedActiveApp = null;
let pollTimer = null;
let isPolling = false;
let activeWinPromise = null;

async function getActiveWinFn() {
  if (!activeWinPromise) {
    activeWinPromise = import('active-win').then((module) => module.default || module);
  } 

  return activeWinPromise;
}

function normalizeWindowInfo(windowInfo) {
  if (!windowInfo) {
    return null;
  }

  const appPath = windowInfo.owner?.path || '';

  return {
    title: windowInfo.title || '',
    name: windowInfo.owner?.name || path.basename(appPath) || 'Unknown App',
    exe: appPath ? path.basename(appPath) : '',
    path: appPath
  };
}

async function pollActiveApp() {
  if (isPolling) {
    return cachedActiveApp;
  }

  isPolling = true;

  try {
    const activeWin = await getActiveWinFn();
    const windowInfo = await activeWin();
    cachedActiveApp = normalizeWindowInfo(windowInfo);
  } catch (error) {
    cachedActiveApp = cachedActiveApp || null;
  } finally {
    isPolling = false;
  }

  return cachedActiveApp;
}

function startActiveAppPolling(intervalMs) {
  if (pollTimer) {
    return;
  }

  void pollActiveApp();
  pollTimer = setInterval(() => {
    void pollActiveApp();
  }, intervalMs);
}

function stopActiveAppPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function getCachedActiveApp() {
  return cachedActiveApp;
}

module.exports = {
  getCachedActiveApp,
  pollActiveApp,
  startActiveAppPolling,
  stopActiveAppPolling
};
