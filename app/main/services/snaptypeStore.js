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

function sanitizeSnippet(snippet, triggerChar) {
  const shortcut = typeof snippet?.shortcut === 'string' ? snippet.shortcut.trim() : '';
  const body = typeof snippet?.body === 'string' ? snippet.body : '';

  return {
    id: typeof snippet?.id === 'string' && snippet.id ? snippet.id : makeId('snip'),
    shortcut: shortcut || `${triggerChar || '/'}new`,
    body
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
      body: ''
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
}

module.exports = {
  DEFAULT_STATE,
  SnapTypeStore
};
