function extractPlaceholders(body = '') {
  const placeholders = [];
  const seen = new Set();
  const matcher = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let match = matcher.exec(body);

  while (match) {
    const placeholder = match[1];

    if (!seen.has(placeholder)) {
      seen.add(placeholder);
      placeholders.push(placeholder);
    }

    match = matcher.exec(body);
  }

  return placeholders;
}

function resolvePlaceholders(body = '', values = {}) {
  return body.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, placeholder) => {
    const value = values[placeholder];

    return typeof value === 'string' ? value : '';
  });
}

module.exports = {
  extractPlaceholders,
  resolvePlaceholders
};
