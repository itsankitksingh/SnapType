const { Menu, Tray } = require('electron');

function createTray({
  iconPath,
  onToggleWindow,
  onPauseFor15Minutes,
  onPauseUntilRestart,
  onResumeExpansion,
  getPauseState,
  onQuit
}) {
  const tray = new Tray(iconPath);
  tray.addListener('double-click', onToggleWindow);
  tray.addListener('click', onToggleWindow);

  tray.refreshMenu = () => {
    const pauseState = typeof getPauseState === 'function' ? getPauseState() : { isPaused: false, mode: 'running' };
    const isPaused = Boolean(pauseState.isPaused);
    const isTimedPause = pauseState.mode === 'until-time';
    const isRestartPause = pauseState.mode === 'until-restart';
    tray.setToolTip(isPaused ? 'SnapType (Paused)' : 'SnapType');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show SnapType',
        click: onToggleWindow
      },
      {
        type: 'separator'
      },
      {
        label: 'Pause for 15 Minutes',
        type: 'checkbox',
        checked: isTimedPause,
        click: onPauseFor15Minutes
      },
      {
        label: 'Pause Until Restart',
        type: 'checkbox',
        checked: isRestartPause,
        click: onPauseUntilRestart
      },
      {
        label: 'Resume Expansion',
        enabled: isPaused,
        click: onResumeExpansion
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
  };

  tray.refreshMenu();
  return tray;
}

module.exports = {
  createTray
};
