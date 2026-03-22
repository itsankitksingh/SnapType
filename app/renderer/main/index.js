const uiState = {
  data: null,
  meta: null,
  view: 'snippet',
  selectedFolderId: null,
  selectedSnippetId: null,
  collapsedFolders: {},
  searchTerm: '',
  editorDraft: null,
  saveTimer: null,
  settingsTimer: null,
  toastTimer: null
};

const elements = {
  searchInput: document.querySelector('#searchInput'),
  folderList: document.querySelector('#folderList'),
  viewRoot: document.querySelector('#viewRoot'),
  newSnippetButton: document.querySelector('#newSnippetButton'),
  newFolderButton: document.querySelector('#newFolderButton'),
  settingsButton: document.querySelector('#settingsButton'),
  countdownOverlay: document.querySelector('#countdownOverlay'),
  countdownValue: document.querySelector('#countdownValue'),
  toast: document.querySelector('#toast')
};

function isEditorInputActive() {
  const activeElement = document.activeElement;

  return activeElement?.id === 'shortcutInput' || activeElement?.id === 'bodyInput';
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function filePathToUrl(filePath) {
  if (!filePath) {
    return '';
  }

  return encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
}

function extractPlaceholders(body = '') {
  const placeholders = [];
  const seen = new Set();
  const matcher = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let match = matcher.exec(body);

  while (match) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      placeholders.push(match[1]);
    }

    match = matcher.exec(body);
  }

  return placeholders;
}

function getAllFolders() {
  return uiState.data?.folders || [];
}

function getSelectedSnippetInfo() {
  for (const folder of getAllFolders()) {
    const snippet = folder.snippets.find((item) => item.id === uiState.selectedSnippetId);

    if (snippet) {
      return { folder, snippet };
    }
  }

  return null;
}

function ensureSelection() {
  const folders = getAllFolders();

  if (!uiState.selectedFolderId && folders[0]) {
    uiState.selectedFolderId = folders[0].id;
  }

  if (uiState.view === 'settings') {
    return;
  }

  const current = getSelectedSnippetInfo();

  if (current) {
    uiState.selectedFolderId = current.folder.id;
    return;
  }

  for (const folder of folders) {
    if (folder.snippets.length > 0) {
      uiState.selectedFolderId = folder.id;
      uiState.selectedSnippetId = folder.snippets[0].id;
      uiState.editorDraft = structuredClone(folder.snippets[0]);
      return;
    }
  }

  uiState.selectedSnippetId = null;
  uiState.editorDraft = null;
}

function applySnapshot(payload, options = {}) {
  if (!payload?.state) {
    return;
  }

  uiState.data = payload.state;
  uiState.meta = payload.meta || uiState.meta;
  ensureSelection();

  if (!options.preserveDraft) {
    const current = getSelectedSnippetInfo();
    uiState.editorDraft = current ? structuredClone(current.snippet) : null;
  }
}

function showToast(message, isError = false) {
  clearTimeout(uiState.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden', 'error');

  if (isError) {
    elements.toast.classList.add('error');
  }

  uiState.toastTimer = window.setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2600);
}

function getFilteredFolders() {
  const searchTerm = normalizeSearch(uiState.searchTerm);

  if (!searchTerm) {
    return getAllFolders();
  }

  return getAllFolders()
    .map((folder) => {
      const folderMatches = normalizeSearch(folder.name).includes(searchTerm);
      const snippets = folder.snippets.filter((snippet) => {
        if (folderMatches) {
          return true;
        }

        return normalizeSearch(`${snippet.shortcut} ${snippet.body}`).includes(searchTerm);
      });

      return { ...folder, snippets };
    })
    .filter((folder) => folder.snippets.length > 0 || normalizeSearch(folder.name).includes(searchTerm));
}

function buildPreviewHtml(body) {
  return escapeHtml(body || 'Your snippet preview will appear here.')
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, '<mark>{{$1}}</mark>')
    .replaceAll('\n', '<br />');
}

function renderSidebar() {
  const filteredFolders = getFilteredFolders();

  if (filteredFolders.length === 0) {
    elements.folderList.innerHTML = '<div class="empty-folder-state">No snippets match that search.</div>';
    return;
  }

  elements.folderList.innerHTML = filteredFolders
    .map((folder) => {
      const collapsed = Boolean(uiState.collapsedFolders[folder.id]);
      const snippetsMarkup = collapsed
        ? ''
        : folder.snippets.length > 0
          ? `<div class="snippet-list">
              ${folder.snippets
                .map(
                  (snippet) => `
                    <button
                      class="snippet-item ${snippet.id === uiState.selectedSnippetId && uiState.view !== 'settings' ? 'selected' : ''}"
                      data-snippet-select="${snippet.id}"
                      data-folder-id="${folder.id}"
                      type="button"
                    >
                      <span class="snippet-shortcut">${escapeHtml(snippet.shortcut)}</span>
                      <span class="snippet-preview">${escapeHtml(snippet.body || 'Empty snippet')}</span>
                    </button>
                  `
                )
                .join('')}
            </div>`
          : '<div class="empty-folder-state">No snippets here yet.</div>';

      return `
        <section class="folder-card">
          <div class="folder-header">
            <button class="folder-toggle" data-folder-toggle="${folder.id}" type="button">
              <span class="folder-header-main">
                <span class="folder-chevron">${collapsed ? '>' : 'v'}</span>
                <span>
                  <span class="folder-name">${escapeHtml(folder.name)}</span>
                  <span class="folder-count">${folder.snippets.length} snippet${folder.snippets.length === 1 ? '' : 's'}</span>
                </span>
              </span>
            </button>
            <span class="folder-actions">
              <button class="icon-action" data-folder-rename="${folder.id}" type="button" title="Rename folder">R</button>
              <button class="icon-action" data-folder-delete="${folder.id}" type="button" title="Delete folder">D</button>
            </span>
          </div>
          ${snippetsMarkup}
        </section>
      `;
    })
    .join('');

  elements.folderList.querySelectorAll('[data-folder-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const folderId = button.dataset.folderToggle;
      uiState.collapsedFolders[folderId] = !uiState.collapsedFolders[folderId];
      renderSidebar();
    });
  });

  elements.folderList.querySelectorAll('[data-snippet-select]').forEach((button) => {
    button.addEventListener('click', () => {
      uiState.view = 'snippet';
      uiState.selectedFolderId = button.dataset.folderId;
      uiState.selectedSnippetId = button.dataset.snippetSelect;
      const current = getSelectedSnippetInfo();
      uiState.editorDraft = current ? structuredClone(current.snippet) : null;
      renderSidebar();
      renderContent();
    });
  });

  elements.folderList.querySelectorAll('[data-folder-rename]').forEach((button) => {
    button.addEventListener('click', async () => {
      const currentFolder = getAllFolders().find((folder) => folder.id === button.dataset.folderRename);
      const name = window.prompt('Rename folder', currentFolder?.name || 'Folder');

      if (!name) {
        return;
      }

      const result = await window.snaptype.updateFolder(button.dataset.folderRename, { name });

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result, { preserveDraft: true });
      renderSidebar();
      renderContent();
    });
  });

  elements.folderList.querySelectorAll('[data-folder-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Delete this folder and all of its snippets?')) {
        return;
      }

      const result = await window.snaptype.deleteFolder(button.dataset.folderDelete);

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result);
      renderSidebar();
      renderContent();
    });
  });
}

function renderAllowedApps(settings) {
  if (settings.activeIn.apps.length === 0) {
    return '<div class="empty-allowlist">No apps added yet. Choose an .exe file or capture the active window.</div>';
  }

  return `
    <div class="allowed-apps">
      ${settings.activeIn.apps
        .map((appInfo) => {
          const icon = filePathToUrl(appInfo.icon);

          return `
            <article class="app-row">
              ${
                icon
                  ? `<img src="${icon}" alt="${escapeHtml(appInfo.name)} icon" />`
                  : `<div class="app-fallback">${escapeHtml((appInfo.name || '?').slice(0, 1).toUpperCase())}</div>`
              }
              <div class="app-meta">
                <strong>${escapeHtml(appInfo.name)}</strong>
                <span>${escapeHtml(appInfo.exe || appInfo.path || 'Unknown executable')}</span>
              </div>
              <button class="danger-button" data-remove-app="${escapeHtml(appInfo.path || appInfo.exe)}" type="button">Remove</button>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderEmptyState() {
  elements.viewRoot.innerHTML = `
    <section class="empty-state">
      <p class="eyebrow">Ready to expand text</p>
      <h2>No snippet selected</h2>
      <p>Create a new snippet, give it a shortcut, and SnapType will replace that shortcut anywhere you type.</p>
      <button id="emptyCreateButton" class="primary-button" type="button">Create Your First Snippet</button>
    </section>
  `;

  document.querySelector('#emptyCreateButton').addEventListener('click', () => {
    void createSnippet();
  });
}

function renderEditor() {
  const current = getSelectedSnippetInfo();

  if (!current) {
    renderEmptyState();
    return;
  }

  if (!uiState.editorDraft || uiState.editorDraft.id !== current.snippet.id) {
    uiState.editorDraft = structuredClone(current.snippet);
  }

  const placeholders = extractPlaceholders(uiState.editorDraft.body);

  elements.viewRoot.innerHTML = `
    <section class="editor-shell">
      <div class="content-head">
        <div>
          <p class="eyebrow">Snippet Editor</p>
          <h2 class="content-title">${escapeHtml(uiState.editorDraft.shortcut || 'New snippet')}</h2>
        </div>
        <div class="head-actions">
          <span class="folder-pill">${escapeHtml(current.folder.name)}</span>
          <button id="deleteSnippetButton" class="danger-button" type="button">Delete Snippet</button>
        </div>
      </div>

      <div class="form-grid">
        <div class="field-row">
          <div class="field-group">
            <label for="shortcutInput">Shortcut</label>
            <input id="shortcutInput" class="shortcut-input" type="text" spellcheck="false" autocomplete="off" value="${escapeHtml(uiState.editorDraft.shortcut)}" />
          </div>
          <div class="preview-card">
            <p class="eyebrow">Placeholder Scan</p>
            <span class="pill-badge">${placeholders.length} placeholder${placeholders.length === 1 ? '' : 's'} detected</span>
            <p class="helper-text">Patterns like <code>{{name}}</code> open the popup form before insertion.</p>
          </div>
        </div>

        <div class="field-group">
          <label for="bodyInput">Snippet Body</label>
          <textarea id="bodyInput" spellcheck="false">${escapeHtml(uiState.editorDraft.body)}</textarea>
          <p class="helper-text">SnapType erases the shortcut, then types this plain text into the active app.</p>
        </div>

        <section class="preview-card">
          <p class="eyebrow">Live Preview</p>
          <pre id="previewOutput">${buildPreviewHtml(uiState.editorDraft.body)}</pre>
        </section>
      </div>
    </section>
  `;

  const shortcutInput = document.querySelector('#shortcutInput');
  const bodyInput = document.querySelector('#bodyInput');
  const previewOutput = document.querySelector('#previewOutput');
  const deleteSnippetButton = document.querySelector('#deleteSnippetButton');
  const placeholderBadge = document.querySelector('.pill-badge');

  function updateEditorState() {
    uiState.editorDraft.shortcut = shortcutInput.value;
    uiState.editorDraft.body = bodyInput.value;
    const nextPlaceholders = extractPlaceholders(uiState.editorDraft.body);
    placeholderBadge.textContent = `${nextPlaceholders.length} placeholder${nextPlaceholders.length === 1 ? '' : 's'} detected`;
    previewOutput.innerHTML = buildPreviewHtml(uiState.editorDraft.body);
    queueSnippetSave();
    renderSidebar();
  }

  shortcutInput.addEventListener('input', updateEditorState);
  bodyInput.addEventListener('input', updateEditorState);

  deleteSnippetButton.addEventListener('click', async () => {
    if (!window.confirm('Delete this snippet?')) {
      return;
    }

    const result = await window.snaptype.deleteSnippet(current.snippet.id);

    if (!result.ok) {
      showToast(result.error, true);
      return;
    }

    applySnapshot(result);
    renderSidebar();
    renderContent();
  });
}

function renderSettings() {
  const settings = uiState.data.settings;

  elements.viewRoot.innerHTML = `
    <section class="settings-shell">
      <div class="settings-head">
        <div>
          <p class="eyebrow">Preferences</p>
          <h2 class="content-title">Settings</h2>
        </div>
        <div class="settings-actions">
          <span class="folder-pill">${escapeHtml(uiState.meta?.toggleShortcut || 'Ctrl+Shift+Space')}</span>
        </div>
      </div>

      <div class="settings-stack">
        <section class="settings-card">
          <h3>General</h3>

          <div class="toggle-row">
            <div class="row-copy">
              <strong>Launch at Windows startup</strong>
              <span>SnapType will start in the tray when you sign in.</span>
            </div>
            <label class="toggle">
              <input id="launchToggle" type="checkbox" ${settings.launchOnStartup ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="about-row">
            <div class="row-copy">
              <strong>Show or hide the app</strong>
              <span>Use the global shortcut any time.</span>
            </div>
            <span class="folder-pill">${escapeHtml(uiState.meta?.toggleShortcut || 'Ctrl+Shift+Space')}</span>
          </div>

          <div class="about-row">
            <div class="row-copy">
              <strong>Trigger character prefix</strong>
              <span>Used as the default prefix when you create new snippets.</span>
            </div>
            <input id="triggerInput" class="trigger-input" type="text" maxlength="1" value="${escapeHtml(settings.triggerChar)}" />
          </div>
        </section>

        <section class="settings-card">
          <h3>Active In</h3>

          <div class="radio-wrap">
            <div class="radio-option">
              <input id="modeGlobal" name="activeMode" type="radio" value="global" ${settings.activeIn.mode === 'global' ? 'checked' : ''} />
              <label for="modeGlobal">
                <strong>All Apps</strong>
                <span class="shortcut-note">Expand snippets anywhere except inside SnapType itself.</span>
              </label>
            </div>

            <div class="radio-option">
              <input id="modeAllowlist" name="activeMode" type="radio" value="allowlist" ${settings.activeIn.mode === 'allowlist' ? 'checked' : ''} />
              <label for="modeAllowlist">
                <strong>Only these apps</strong>
                <span class="shortcut-note">Use a focused allowlist for work tools, browsers, or chat apps.</span>
              </label>
            </div>
          </div>

          ${
            settings.activeIn.mode === 'allowlist'
              ? `
                <div class="apps-toolbar">
                  <button id="addAppButton" class="secondary-button" type="button">Add App</button>
                  <button id="pickActiveButton" class="ghost-button" type="button">Pick Active Window</button>
                </div>
                ${renderAllowedApps(settings)}
              `
              : '<p class="shortcut-note">Restriction is off, so snippets can expand in all supported text fields across Windows.</p>'
          }
        </section>

        <section class="settings-card">
          <h3>About</h3>

          <div class="about-row">
            <div class="row-copy">
              <strong>Version</strong>
              <span>${escapeHtml(uiState.meta?.version || '1.0.0')}</span>
            </div>
            <span class="lite-badge">Lightweight build</span>
          </div>
        </section>
      </div>
    </section>
  `;

  document.querySelector('#launchToggle').addEventListener('change', async (event) => {
    const result = await window.snaptype.updateSettings({
      launchOnStartup: event.target.checked
    });

    if (!result.ok) {
      showToast(result.error, true);
      return;
    }

    applySnapshot(result, { preserveDraft: true });
    renderSettings();
  });

  document.querySelectorAll('input[name="activeMode"]').forEach((radio) => {
    radio.addEventListener('change', async (event) => {
      const result = await window.snaptype.updateSettings({
        activeIn: {
          mode: event.target.value
        }
      });

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result, { preserveDraft: true });
      renderSettings();
    });
  });

  const triggerInput = document.querySelector('#triggerInput');

  triggerInput.addEventListener('input', () => {
    clearTimeout(uiState.settingsTimer);
    uiState.settingsTimer = window.setTimeout(async () => {
      const result = await window.snaptype.updateSettings({
        triggerChar: triggerInput.value || '/'
      });

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result, { preserveDraft: true });
    }, 220);
  });

  const addAppButton = document.querySelector('#addAppButton');
  const pickActiveButton = document.querySelector('#pickActiveButton');

  if (addAppButton) {
    addAppButton.addEventListener('click', async () => {
      const result = await window.snaptype.chooseAllowedApp();

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      if (!result.canceled) {
        applySnapshot(result, { preserveDraft: true });
        renderSettings();
      }
    });
  }

  if (pickActiveButton) {
    pickActiveButton.addEventListener('click', async () => {
      const result = await runCountdownCapture();

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result, { preserveDraft: true });
      renderSettings();
    });
  }

  document.querySelectorAll('[data-remove-app]').forEach((button) => {
    button.addEventListener('click', async () => {
      const result = await window.snaptype.removeAllowedApp(button.dataset.removeApp);

      if (!result.ok) {
        showToast(result.error, true);
        return;
      }

      applySnapshot(result, { preserveDraft: true });
      renderSettings();
    });
  });
}

function renderContent() {
  if (!uiState.data) {
    return;
  }

  if (uiState.view === 'settings') {
    renderSettings();
    return;
  }

  const current = getSelectedSnippetInfo();

  if (!current) {
    renderEmptyState();
    return;
  }

  renderEditor();
}

function queueSnippetSave() {
  clearTimeout(uiState.saveTimer);

  uiState.saveTimer = window.setTimeout(async () => {
    const draft = uiState.editorDraft;

    if (!draft) {
      return;
    }

    const current = getSelectedSnippetInfo();
    const nextShortcut = draft.shortcut.trim() || current?.snippet.shortcut || `${uiState.data.settings.triggerChar}new`;
    const result = await window.snaptype.updateSnippet(draft.id, {
      shortcut: nextShortcut,
      body: draft.body
    });

    if (!result.ok) {
      showToast(result.error, true);
      return;
    }

    uiState.data = result.state;
    uiState.meta = result.meta;
    renderSidebar();
  }, 180);
}

async function createSnippet() {
  const targetFolderId = uiState.selectedFolderId || getAllFolders()[0]?.id;
  const result = await window.snaptype.createSnippet(targetFolderId);

  if (!result.ok) {
    showToast(result.error, true);
    return;
  }

  uiState.view = 'snippet';
  uiState.selectedSnippetId = result.snippet.id;
  applySnapshot(result);
  renderSidebar();
  renderContent();
}

async function createFolder() {
  const name = window.prompt('New folder name', 'New Folder');

  if (!name) {
    return;
  }

  const result = await window.snaptype.createFolder(name);

  if (!result.ok) {
    showToast(result.error, true);
    return;
  }

  uiState.selectedFolderId = result.folder.id;
  applySnapshot(result, { preserveDraft: true });
  renderSidebar();
  renderContent();
}

async function runCountdownCapture() {
  elements.countdownOverlay.classList.remove('hidden');

  for (const value of [3, 2, 1]) {
    elements.countdownValue.textContent = String(value);
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  elements.countdownOverlay.classList.add('hidden');
  return window.snaptype.pickActiveApp();
}

function bindStaticEvents() {
  elements.searchInput.addEventListener('input', (event) => {
    uiState.searchTerm = event.target.value;
    renderSidebar();
  });

  elements.newSnippetButton.addEventListener('click', () => {
    void createSnippet();
  });

  elements.newFolderButton.addEventListener('click', () => {
    void createFolder();
  });

  elements.settingsButton.addEventListener('click', () => {
    uiState.view = 'settings';
    renderSidebar();
    renderContent();
  });
}

async function loadInitialState() {
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await window.snaptype.getState();
    } catch (error) {
      lastError = error;
      await sleep(120);
    }
  }

  throw lastError || new Error('Unable to load SnapType state.');
}

async function init() {
  bindStaticEvents();
  window.snaptype.onStateChanged((snapshot) => {
    const preserveDraft = isEditorInputActive();
    applySnapshot(snapshot, { preserveDraft });
    renderSidebar();

    if (!preserveDraft || uiState.view === 'settings') {
      renderContent();
    }
  });

  const snapshot = await loadInitialState();
  applySnapshot(snapshot);
  renderSidebar();
  renderContent();
}

window.addEventListener('beforeunload', () => {
  clearTimeout(uiState.saveTimer);
  clearTimeout(uiState.settingsTimer);
  clearTimeout(uiState.toastTimer);
});

void init();
