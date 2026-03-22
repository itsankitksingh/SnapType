const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

class WindowManager {
  constructor(options = {}) {
    this.rendererDir = options.rendererDir;
    this.preloadPath = options.preloadPath;
    this.iconPath = options.iconPath;
    this.isQuitting = false;
    this.mainWindow = null;
    this.popupWindow = null;
    this.mainLoadPromise = null;
    this.popupLoadPromise = null;
  }

  setQuitting(isQuitting) {
    this.isQuitting = isQuitting;
  }

  createMainWindow() {
    if (this.mainWindow) {
      return this.mainWindow;
    }

    this.mainWindow = new BrowserWindow({
      width: 1160,
      height: 760,
      minWidth: 760,
      minHeight: 560,
      show: false,
      frame: false,
      icon: this.iconPath,
      backgroundColor: '#202020',
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });

    this.mainLoadPromise = this.mainWindow.loadFile(path.join(this.rendererDir, 'main', 'index.html'));
    return this.mainWindow;
  }

  createPopupWindow() {
    if (this.popupWindow) {
      return this.popupWindow;
    }

    this.popupWindow = new BrowserWindow({
      width: 420,
      height: 320,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      transparent: false,
      backgroundColor: '#0d141c',
      icon: this.iconPath,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });
    this.popupWindow.setAlwaysOnTop(true, 'screen-saver');
    this.popupWindow.removeMenu();
    this.popupWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.popupWindow.hide();
      }
    });

    this.popupLoadPromise = this.popupWindow.loadFile(path.join(this.rendererDir, 'popup', 'index.html'));
    return this.popupWindow;
  }

  async ensureWindows() {
    this.createMainWindow();
    this.createPopupWindow();
    await Promise.all([this.mainLoadPromise, this.popupLoadPromise]);
  }

  showMainWindow() {
    const window = this.createMainWindow();

    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
  }

  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  toggleMainWindow() {
    if (!this.mainWindow || !this.mainWindow.isVisible()) {
      this.showMainWindow();
      return;
    }

    this.hideMainWindow();
  }

  async showPopup(payload) {
    const popup = this.createPopupWindow();
    await this.popupLoadPromise;

    const placeholderCount = payload.placeholders?.length || 0;
    const height = Math.min(620, Math.max(300, 210 + placeholderCount * 72));
    popup.setBounds({
      ...popup.getBounds(),
      width: 420,
      height
    });
    this.positionPopupNearCursor(popup);
    popup.show();
    popup.focus();
    popup.webContents.send('popup:open', payload);
  }

  hidePopup() {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.blur();
      this.popupWindow.hide();
    }
  }

  sendState(snapshot) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('state:changed', snapshot);
    }
  }

  positionPopupNearCursor(popup) {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = popup.getBounds();
    const margin = 16;
    const maxX = display.workArea.x + display.workArea.width - bounds.width - margin;
    const maxY = display.workArea.y + display.workArea.height - bounds.height - margin;
    const nextX = Math.min(Math.max(display.workArea.x + margin, cursor.x + 18), maxX);
    const nextY = Math.min(Math.max(display.workArea.y + margin, cursor.y + 18), maxY);

    popup.setPosition(nextX, nextY, false);
  }
}

module.exports = {
  WindowManager
};
