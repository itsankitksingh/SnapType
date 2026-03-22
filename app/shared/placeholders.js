const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function normalizePlaceholderName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseSystemPlaceholder(name) {
  const normalized = normalizePlaceholderName(name);
  const separatorIndex = normalized.indexOf(':');

  if (separatorIndex < 0) {
    return {
      kind: normalized.toLowerCase(),
      format: ''
    };
  }

  return {
    kind: normalized.slice(0, separatorIndex).trim().toLowerCase(),
    format: normalized.slice(separatorIndex + 1).trim()
  };
}

function formatDatePattern(now, pattern) {
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;

  const tokenValues = {
    yyyy: String(now.getFullYear()),
    yy: String(now.getFullYear()).slice(-2),
    MMMM: MONTHS_LONG[now.getMonth()],
    MMM: MONTHS_SHORT[now.getMonth()],
    MM: pad(now.getMonth() + 1),
    M: String(now.getMonth() + 1),
    dd: pad(now.getDate()),
    d: String(now.getDate()),
    HH: pad(hours24),
    H: String(hours24),
    hh: pad(hours12),
    h: String(hours12),
    mm: pad(now.getMinutes()),
    m: String(now.getMinutes()),
    ss: pad(now.getSeconds()),
    s: String(now.getSeconds()),
    A: hours24 >= 12 ? 'PM' : 'AM',
    a: hours24 >= 12 ? 'pm' : 'am'
  };

  return String(pattern || '').replace(
    /yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|A|a/g,
    (token) => tokenValues[token] ?? token
  );
}

const SYSTEM_PLACEHOLDER_TOKENS = Object.freeze({
  date: (now, format) => formatDatePattern(now, format || 'MMM d, yyyy'),
  time: (now, format) => formatDatePattern(now, format || 'h:mm A'),
  datetime: (now, format) => formatDatePattern(now, format || 'MMM d, yyyy h:mm A')
});

function getSystemPlaceholderValue(name, now = new Date()) {
  const { kind, format } = parseSystemPlaceholder(name);
  const formatter = Object.prototype.hasOwnProperty.call(SYSTEM_PLACEHOLDER_TOKENS, kind)
    ? SYSTEM_PLACEHOLDER_TOKENS[kind]
    : null;

  return typeof formatter === 'function' ? formatter(now, format) : null;
}

function isSystemPlaceholder(name) {
  return Object.prototype.hasOwnProperty.call(
    SYSTEM_PLACEHOLDER_TOKENS,
    parseSystemPlaceholder(name).kind
  );
}

function extractPlaceholders(body = '') {
  const placeholders = [];
  const seen = new Set();
  const matcher = new RegExp(PLACEHOLDER_PATTERN);
  let match = matcher.exec(body);

  while (match) {
    const placeholder = normalizePlaceholderName(match[1]);

    if (placeholder && !isSystemPlaceholder(placeholder) && !seen.has(placeholder)) {
      seen.add(placeholder);
      placeholders.push(placeholder);
    }

    match = matcher.exec(body);
  }

  return placeholders;
}

function resolvePlaceholders(body = '', values = {}) {
  const normalizedValues = Object.create(null);

  Object.entries(values || {}).forEach(([key, value]) => {
    const normalizedKey = normalizePlaceholderName(key).toLowerCase();
    normalizedValues[normalizedKey] = typeof value === 'string' ? value : '';
  });

  return body.replace(PLACEHOLDER_PATTERN, (_match, placeholder) => {
    const normalizedName = normalizePlaceholderName(placeholder);
    const systemValue = getSystemPlaceholderValue(normalizedName);

    if (systemValue !== null) {
      return systemValue;
    }

    const value = values[normalizedName];

    if (typeof value === 'string') {
      return value;
    }

    const normalizedValue = normalizedValues[normalizedName.toLowerCase()];
    return typeof normalizedValue === 'string' ? normalizedValue : '';
  });
}

module.exports = {
  extractPlaceholders,
  getSystemPlaceholderValue,
  isSystemPlaceholder,
  parseSystemPlaceholder,
  resolvePlaceholders,
  SYSTEM_PLACEHOLDER_TOKENS
};
