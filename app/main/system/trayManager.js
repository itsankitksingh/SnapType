const { Menu, Tray } = require('electron');

function createTray({ iconPath, onToggleWindow, onQuit }) {
  const tray = new Tray(iconPath);
  tray.setToolTip('SnapType');
  tray.addListener('double-click', onToggleWindow);
  tray.addListener('click', onToggleWindow);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SnapType',
      click: onToggleWindow
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: onQuit
    }
  ]);

  tray.setContextMenu(contextMenu);
  return tray;
}

module.exports = {
  createTray
};
