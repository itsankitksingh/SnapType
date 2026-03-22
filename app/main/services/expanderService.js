const { keyboard, Key } = require('@nut-tree/nut-js');
const { extractPlaceholders, resolvePlaceholders } = require('../../shared/placeholders');

keyboard.config.autoDelayMs = 6;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function eraseShortcut(length) {
  for (let index = 0; index < length; index += 1) {
    await keyboard.type(Key.Backspace);
  }

  await sleep(18);
}

async function typeExpandedText(text) {
  if (!text) {
    return;
  }

  await keyboard.type(text);
  await sleep(18);
}

module.exports = {
  eraseShortcut,
  extractPlaceholders,
  resolvePlaceholders,
  typeExpandedText
};
