const path = require('node:path');
const sharedConstants = require('../../shared/constants');

const APP_DIR = path.resolve(__dirname, '../..');
const ROOT_DIR = path.resolve(APP_DIR, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.ico');
const PRELOAD_PATH = path.join(APP_DIR, 'preload', 'index.js');
const RENDERER_DIR = path.join(APP_DIR, 'renderer');

module.exports = {
  ...sharedConstants,
  APP_DIR,
  ASSETS_DIR,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_DIR,
  ROOT_DIR
};
