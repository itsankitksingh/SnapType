const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

let ElectronStorePromise = null;

const DEFAULT_STATE = {
  folders: [
    {
      id: 'folder_general',
      name: 'General',
      snippets: [
        {
          id: 'snip_new',
          shortcut: '/new',
          body: ''
        },
        {
          id: 'snip_name',
          shortcut: '/nme',
          body: 'Ankit Kumar Singh'
        },
        {
          id: 'snip_thanks',
          shortcut: '/ty',
          body: 'thank you'
        }
      ]
    }
  ],
  settings: {
    launchOnStartup: false,
    triggerChar: '/',
    theme: 'midnight',
    activeIn: {
      mode: 'global',
      apps: []
    }
  }
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function sanitizeSnippetStats(stats) {
  const usageCount = Number.isFinite(stats?.usageCount) ? Math.max(0, Math.floor(stats.usageCount)) : 0;
  const lastUsedAt =
    typeof stats?.lastUsedAt === 'string' && stats.lastUsedAt.trim() ? stats.lastUsedAt.trim() : '';

  return {
    usageCount,
    lastUsedAt
  };
}

function sanitizeSnippetActiveIn(activeIn) {
  return {
    mode: activeIn?.mode === 'specific' ? 'specific' : 'all',
    apps: Array.isArray(activeIn?.apps) ? activeIn.apps.map(sanitizeAllowedApp) : []
  };
}

function sanitizeSnippet(snippet, triggerChar) {
  const shortcut = typeof snippet?.shortcut === 'string' ? snippet.shortcut.trim() : '';
  const body = typeof snippet?.body === 'string' ? snippet.body : '';

  return {
    id: typeof snippet?.id === 'string' && snippet.id ? snippet.id : makeId('snip'),
    shortcut: shortcut || `${triggerChar || '/'}new`,
    body,
    activeIn: sanitizeSnippetActiveIn(snippet?.activeIn),
    stats: sanitizeSnippetStats(snippet?.stats)
  };
}

function sanitizeFolder(folder, triggerChar) {
  return {
    id: typeof folder?.id === 'string' && folder.id ? folder.id : makeId('folder'),
    name: typeof folder?.name === 'string' && folder.name.trim() ? folder.name.trim() : 'Untitled Folder',
    snippets: Array.isArray(folder?.snippets)
      ? folder.snippets.map((snippet) => sanitizeSnippet(snippet, triggerChar))
      : []
  };
}

function sanitizeAllowedApp(appInfo) {
  const appPath = typeof appInfo?.path === 'string' ? appInfo.path.trim() : '';

  return {
    name: typeof appInfo?.name === 'string' && appInfo.name.trim() ? appInfo.name.trim() : 'Unknown App',
    exe:
      typeof appInfo?.exe === 'string' && appInfo.exe.trim()
        ? appInfo.exe.trim()
        : (appPath ? path.basename(appPath) : ''),
    path: appPath,
    icon: typeof appInfo?.icon === 'string' ? appInfo.icon : ''
  };
}

function ensureState(rawState) {
  const triggerChar =
    typeof rawState?.settings?.triggerChar === 'string' && rawState.settings.triggerChar.trim()
      ? rawState.settings.triggerChar.trim().slice(0, 1)
      : DEFAULT_STATE.settings.triggerChar;

  const folders = Array.isArray(rawState?.folders)
    ? rawState.folders.map((folder) => sanitizeFolder(folder, triggerChar))
    : [];

  if (folders.length === 0) {
    folders.push(...deepClone(DEFAULT_STATE.folders));
  }

  const apps = Array.isArray(rawState?.settings?.activeIn?.apps)
    ? rawState.settings.activeIn.apps.map(sanitizeAllowedApp)
    : [];

  return {
    folders,
    settings: {
      launchOnStartup: Boolean(rawState?.settings?.launchOnStartup),
      triggerChar,
      theme:
        rawState?.settings?.theme === 'forest' || rawState?.settings?.theme === 'sunrise'
          ? rawState.settings.theme
          : DEFAULT_STATE.settings.theme,
      activeIn: {
        mode: rawState?.settings?.activeIn?.mode === 'allowlist' ? 'allowlist' : 'global',
        apps
      }
    }
  };
}

function findSnippetLocation(state, snippetId) {
  for (const folder of state.folders) {
    const snippetIndex = folder.snippets.findIndex((snippet) => snippet.id === snippetId);

    if (snippetIndex >= 0) {
      return { folder, snippet: folder.snippets[snippetIndex], snippetIndex };
    }
  }

  return null;
}

function moveItem(array, fromIndex, toIndex) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= array.length || toIndex >= array.length) {
    return false;
  }

  if (fromIndex === toIndex) {
    return false;
  }

  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
  return true;
}

function mergeSettings(current, patch) {
  const nextTriggerChar =
    typeof patch?.triggerChar === 'string' && patch.triggerChar.trim()
      ? patch.triggerChar.trim().slice(0, 1)
      : current.triggerChar;

  const nextApps = Array.isArray(patch?.activeIn?.apps)
    ? patch.activeIn.apps.map(sanitizeAllowedApp)
    : current.activeIn.apps;

  return {
    launchOnStartup:
      typeof patch?.launchOnStartup === 'boolean' ? patch.launchOnStartup : current.launchOnStartup,
    triggerChar: nextTriggerChar,
    theme:
      patch?.theme === 'forest' || patch?.theme === 'sunrise' || patch?.theme === 'midnight'
        ? patch.theme
        : current.theme,
    activeIn: {
      mode: patch?.activeIn?.mode === 'allowlist' ? 'allowlist' : patch?.activeIn?.mode === 'global' ? 'global' : current.activeIn.mode,
      apps: nextApps
    }
  };
}

class SnapTypeStore extends EventEmitter {
  static async create() {
    if (!ElectronStorePromise) {
      ElectronStorePromise = import('electron-store').then((module) => module.default || module);
    }

    const ElectronStore = await ElectronStorePromise;
    const diskStore = new ElectronStore({
      name: 'snaptype',
      defaults: DEFAULT_STATE,
      clearInvalidConfig: false
    });

    return new SnapTypeStore(diskStore);
  }

  constructor(diskStore) {
    super();
    this.diskStore = diskStore;
    this.state = ensureState(this.diskStore.store);
    this.shortcutMap = Object.create(null);
    this.shortcutLengths = [];
    this.reindex();
    this.persist();
  }

  persist() {
    this.diskStore.set(this.state);
  }

  reindex() {
    const shortcutMap = Object.create(null);
    const shortcutLengths = new Set();

    for (const folder of this.state.folders) {
      for (const snippet of folder.snippets) {
        const shortcut = typeof snippet.shortcut === 'string' ? snippet.shortcut.trim() : '';

        if (!shortcut) {
          continue;
        }

        shortcutMap[shortcut] = deepClone(snippet);
        shortcutLengths.add(shortcut.length);
      }
    }

    this.shortcutMap = shortcutMap;
    this.shortcutLengths = Array.from(shortcutLengths).sort((left, right) => right - left);
  }

  commit() {
    this.reindex();
    this.persist();
    const snapshot = this.getSnapshot();
    this.emit('changed', {
      state: snapshot,
      shortcutMap: { ...this.shortcutMap },
      shortcutLengths: [...this.shortcutLengths]
    });

    return snapshot;
  }

  getSnapshot() {
    return deepClone(this.state);
  }

  getShortcutIndex() {
    return {
      shortcutMap: { ...this.shortcutMap },
      shortcutLengths: [...this.shortcutLengths]
    };
  }

  createFolder(name = 'New Folder') {
    const folder = {
      id: makeId('folder'),
      name: typeof name === 'string' && name.trim() ? name.trim() : 'New Folder',
      snippets: []
    };

    this.state.folders.push(folder);

    return {
      folder: deepClone(folder),
      state: this.commit()
    };
  }

  updateFolder(folderId, patch = {}) {
    const folder = this.state.folders.find((item) => item.id === folderId);

    if (!folder) {
      throw new Error('Folder not found.');
    }

    if (typeof patch.name === 'string' && patch.name.trim()) {
      folder.name = patch.name.trim();
    }

    return this.commit();
  }

  deleteFolder(folderId) {
    const folderIndex = this.state.folders.findIndex((folder) => folder.id === folderId);

    if (folderIndex < 0) {
      throw new Error('Folder not found.');
    }

    if (this.state.folders.length === 1) {
      throw new Error('At least one folder is required.');
    }

    this.state.folders.splice(folderIndex, 1);

    return this.commit();
  }

  createSnippet(folderId) {
    const folder = this.state.folders.find((item) => item.id === folderId) || this.state.folders[0];
    const snippet = {
      id: makeId('snip'),
      shortcut: `${this.state.settings.triggerChar}new`,
      body: '',
      activeIn: {
        mode: 'all',
        apps: []
      },
      stats: {
        usageCount: 0,
        lastUsedAt: ''
      }
    };

    folder.snippets.unshift(snippet);

    return {
      snippet: deepClone(snippet),
      state: this.commit()
    };
  }

  updateSnippet(snippetId, patch = {}) {
    const location = findSnippetLocation(this.state, snippetId);

    if (!location) {
      throw new Error('Snippet not found.');
    }

    if (typeof patch.shortcut === 'string') {
      location.snippet.shortcut = patch.shortcut.trim() || location.snippet.shortcut;
    }

    if (typeof patch.body === 'string') {
      location.snippet.body = patch.body;
    }

    if (patch.activeIn && typeof patch.activeIn === 'object') {
      const currentActiveIn = sanitizeSnippetActiveIn(location.snippet.activeIn);
      location.snippet.activeIn = {
        mode: patch.activeIn.mode === 'specific' ? 'specific' : patch.activeIn.mode === 'all' ? 'all' : currentActiveIn.mode,
        apps: Array.isArray(patch.activeIn.apps) ? patch.activeIn.apps.map(sanitizeAllowedApp) : currentActiveIn.apps
      };
    }

    if (patch.stats && typeof patch.stats === 'object') {
      const currentStats = sanitizeSnippetStats(location.snippet.stats);
      location.snippet.stats = {
        usageCount:
          Number.isFinite(patch.stats.usageCount)
            ? Math.max(0, Math.floor(patch.stats.usageCount))
            : currentStats.usageCount,
        lastUsedAt:
          typeof patch.stats.lastUsedAt === 'string'
            ? patch.stats.lastUsedAt.trim()
            : currentStats.lastUsedAt
      };
    }

    return this.commit();
  }

  deleteSnippet(snippetId) {
    const location = findSnippetLocation(this.state, snippetId);

    if (!location) {
      throw new Error('Snippet not found.');
    }

    location.folder.snippets.splice(location.snippetIndex, 1);

    return this.commit();
  }

  recordSnippetUsage(snippetId, usedAt = new Date().toISOString()) {
    const location = findSnippetLocation(this.state, snippetId);

    if (!location) {
      throw new Error('Snippet not found.');
    }

    const currentStats = sanitizeSnippetStats(location.snippet.stats);
    location.snippet.stats = {
      usageCount: currentStats.usageCount + 1,
      lastUsedAt: usedAt
    };

    return this.commit();
  }

  updateSettings(patch = {}) {
    this.state.settings = mergeSettings(this.state.settings, patch);
    return this.commit();
  }

  addAllowedApp(appInfo) {
    const normalized = sanitizeAllowedApp(appInfo);
    const apps = this.state.settings.activeIn.apps;
    const duplicateIndex = apps.findIndex((item) => {
      if (normalized.path && item.path) {
        return item.path.toLowerCase() === normalized.path.toLowerCase();
      }

      return item.exe.toLowerCase() === normalized.exe.toLowerCase();
    });

    if (duplicateIndex >= 0) {
      apps[duplicateIndex] = normalized;
    } else {
      apps.push(normalized);
    }

    return this.commit();
  }

  removeAllowedApp(pathOrExe) {
    const target = typeof pathOrExe === 'string' ? pathOrExe.trim().toLowerCase() : '';
    this.state.settings.activeIn.apps = this.state.settings.activeIn.apps.filter((item) => {
      const matchesPath = item.path && item.path.toLowerCase() === target;
      const matchesExe = item.exe && item.exe.toLowerCase() === target;

      return !(matchesPath || matchesExe);
    });

    return this.commit();
  }

  addSnippetAllowedApp(snippetId, appInfo) {
    const location = findSnippetLocation(this.state, snippetId);

    if (!location) {
      throw new Error('Snippet not found.');
    }

    const normalized = sanitizeAllowedApp(appInfo);
    const currentActiveIn = sanitizeSnippetActiveIn(location.snippet.activeIn);
    const duplicateIndex = currentActiveIn.apps.findIndex((item) => {
      if (normalized.path && item.path) {
        return item.path.toLowerCase() === normalized.path.toLowerCase();
      }

      return item.exe.toLowerCase() === normalized.exe.toLowerCase();
    });

    if (duplicateIndex >= 0) {
      currentActiveIn.apps[duplicateIndex] = normalized;
    } else {
      currentActiveIn.apps.push(normalized);
    }

    location.snippet.activeIn = {
      mode: 'specific',
      apps: currentActiveIn.apps
    };

    return this.commit();
  }

  removeSnippetAllowedApp(snippetId, pathOrExe) {
    const location = findSnippetLocation(this.state, snippetId);

    if (!location) {
      throw new Error('Snippet not found.');
    }

    const target = typeof pathOrExe === 'string' ? pathOrExe.trim().toLowerCase() : '';
    const currentActiveIn = sanitizeSnippetActiveIn(location.snippet.activeIn);
    currentActiveIn.apps = currentActiveIn.apps.filter((item) => {
      const matchesPath = item.path && item.path.toLowerCase() === target;
      const matchesExe = item.exe && item.exe.toLowerCase() === target;

      return !(matchesPath || matchesExe);
    });

    location.snippet.activeIn = {
      mode: currentActiveIn.mode,
      apps: currentActiveIn.apps
    };

    return this.commit();
  }

  moveFolder(folderId, direction) {
    const folderIndex = this.state.folders.findIndex((folder) => folder.id === folderId);

    if (folderIndex < 0) {
      throw new Error('Folder not found.');
    }

    const targetIndex =
      direction === 'up'
        ? folderIndex - 1
        : direction === 'down'
          ? folderIndex + 1
          : folderIndex;

    moveItem(this.state.folders, folderIndex, targetIndex);
    return this.commit();
  }
}

module.exports = {
  DEFAULT_STATE,
  SnapTypeStore
};
