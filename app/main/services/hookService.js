const { EventEmitter } = require('node:events');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const LETTERS = {
  [UiohookKey.A]: ['a', 'A'],
  [UiohookKey.B]: ['b', 'B'],
  [UiohookKey.C]: ['c', 'C'],
  [UiohookKey.D]: ['d', 'D'],
  [UiohookKey.E]: ['e', 'E'],
  [UiohookKey.F]: ['f', 'F'],
  [UiohookKey.G]: ['g', 'G'],
  [UiohookKey.H]: ['h', 'H'],
  [UiohookKey.I]: ['i', 'I'],
  [UiohookKey.J]: ['j', 'J'],
  [UiohookKey.K]: ['k', 'K'],
  [UiohookKey.L]: ['l', 'L'],
  [UiohookKey.M]: ['m', 'M'],
  [UiohookKey.N]: ['n', 'N'],
  [UiohookKey.O]: ['o', 'O'],
  [UiohookKey.P]: ['p', 'P'],
  [UiohookKey.Q]: ['q', 'Q'],
  [UiohookKey.R]: ['r', 'R'],
  [UiohookKey.S]: ['s', 'S'],
  [UiohookKey.T]: ['t', 'T'],
  [UiohookKey.U]: ['u', 'U'],
  [UiohookKey.V]: ['v', 'V'],
  [UiohookKey.W]: ['w', 'W'],
  [UiohookKey.X]: ['x', 'X'],
  [UiohookKey.Y]: ['y', 'Y'],
  [UiohookKey.Z]: ['z', 'Z']
};

const NUMBERS = {
  [UiohookKey[0]]: ['0', ')'],
  [UiohookKey[1]]: ['1', '!'],
  [UiohookKey[2]]: ['2', '@'],
  [UiohookKey[3]]: ['3', '#'],
  [UiohookKey[4]]: ['4', '$'],
  [UiohookKey[5]]: ['5', '%'],
  [UiohookKey[6]]: ['6', '^'],
  [UiohookKey[7]]: ['7', '&'],
  [UiohookKey[8]]: ['8', '*'],
  [UiohookKey[9]]: ['9', '(']
};

const PUNCTUATION = {
  [UiohookKey.Space]: [' ', ' '],
  [UiohookKey.Tab]: ['\t', '\t'],
  [UiohookKey.Enter]: ['\n', '\n'],
  [UiohookKey.Minus]: ['-', '_'],
  [UiohookKey.Equal]: ['=', '+'],
  [UiohookKey.BracketLeft]: ['[', '{'],
  [UiohookKey.BracketRight]: [']', '}'],
  [UiohookKey.Backslash]: ['\\', '|'],
  [UiohookKey.Semicolon]: [';', ':'],
  [UiohookKey.Quote]: ["'", '"'],
  [UiohookKey.Comma]: [',', '<'],
  [UiohookKey.Period]: ['.', '>'],
  [UiohookKey.Slash]: ['/', '?'],
  [UiohookKey.Backquote]: ['`', '~']
};

const NAVIGATION_KEYS = new Set([
  UiohookKey.Escape,
  UiohookKey.Home,
  UiohookKey.End,
  UiohookKey.ArrowLeft,
  UiohookKey.ArrowRight,
  UiohookKey.ArrowUp,
  UiohookKey.ArrowDown,
  UiohookKey.Delete,
  UiohookKey.PageUp,
  UiohookKey.PageDown
]);

function resolveCharacter(event) {
  const pair = LETTERS[event.keycode] || NUMBERS[event.keycode] || PUNCTUATION[event.keycode];

  if (!pair) {
    return null;
  }

  return event.shiftKey ? pair[1] : pair[0];
}

class GlobalShortcutHook extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bufferSize = options.bufferSize || 30;
    this.buffer = [];
    this.shortcutMap = Object.create(null);
    this.shortcutLengths = [];
    this.started = false;
    this.paused = false;
    this.suppressedUntil = 0;
    this.handleKeyup = this.handleKeyup.bind(this);
  }

  setShortcutIndex(shortcutMap, shortcutLengths) {
    this.shortcutMap = shortcutMap || Object.create(null);
    this.shortcutLengths = Array.isArray(shortcutLengths) ? shortcutLengths : [];
  }

  clearBuffer() {
    this.buffer.length = 0;
  }

  pause() {
    this.paused = true;
  }

  resume(options = {}) {
    const { clearBuffer = true, suppressForMs = 0 } = options;
    this.paused = false;

    if (clearBuffer) {
      this.clearBuffer();
    }

    if (suppressForMs > 0) {
      this.suppressedUntil = Date.now() + suppressForMs;
    }
  }

  start() {
    if (this.started) {
      return;
    }

    uIOhook.on('keyup', this.handleKeyup);
    uIOhook.start();
    this.started = true;
  }

  stop() {
    if (!this.started) {
      return;
    }

    if (typeof uIOhook.removeListener === 'function') {
      uIOhook.removeListener('keyup', this.handleKeyup);
    } else if (typeof uIOhook.off === 'function') {
      uIOhook.off('keyup', this.handleKeyup);
    }

    uIOhook.stop();
    this.started = false;
  }

  handleKeyup(event) {
    if (this.paused || Date.now() < this.suppressedUntil) {
      return;
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.keycode === UiohookKey.Backspace) {
      this.buffer.pop();
      return;
    }

    if (NAVIGATION_KEYS.has(event.keycode)) {
      this.clearBuffer();
      return;
    }

    const character = resolveCharacter(event);

    if (character === null) {
      return;
    }

    this.buffer.push(character);

    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    for (const shortcutLength of this.shortcutLengths) {
      if (shortcutLength > this.buffer.length) {
        continue;
      }

      const candidate = this.buffer.slice(this.buffer.length - shortcutLength).join('');
      const snippet = this.shortcutMap[candidate];

      if (snippet) {
        this.emit('shortcut', snippet);
        return;
      }
    }
  }
}

module.exports = {
  GlobalShortcutHook
};
