/**
 * Formats bytes to KB with specified decimal precision.
 *
 * @param {number} bytes - File size in bytes
 * @param {number} [precision=1] - Decimal places
 * @returns {string} Formatted size in KB
 */
export function formatFileSize(bytes, precision = 1) {
  if (typeof bytes !== 'number' || isNaN(bytes)) return '0.0';
  return (bytes / 1024).toFixed(precision);
}

/**
 * Splits text into user-perceived grapheme clusters, preventing corruption of
 * multi-byte Unicode surrogate pairs (emojis) and Vietnamese diacritics.
 *
 * @param {string} str - Input text
 * @returns {string[]} Array of graphemes
 */
export function splitGraphemes(str) {
  if (!str) return [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      return Array.from(segmenter.segment(str), (s) => s.segment);
    } catch {
      // Fallback if segmenter instantiation fails
    }
  }
  return Array.from(str);
}

/**
 * Formats a number with locale thousands separators.
 *
 * @param {number|string|null|undefined} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString();
}

/**
 * Formats an ISO date-time string to readable YYYY-MM-DD HH:mm:ss in Vietnam timezone (Asia/Ho_Chi_Minh).
 *
 * @param {string|null|undefined} isoString - ISO timestamp
 * @param {string} [timeZone='Asia/Ho_Chi_Minh'] - IANA time zone
 * @returns {string} Formatted timestamp or dash
 */
export function formatTimestamp(isoString, timeZone = 'Asia/Ho_Chi_Minh') {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
  } catch {
    return isoString;
  }
}

/**
 * Formats a monetary number in VND currency with standard zero-decimal formatting.
 *
 * @param {number|string|null|undefined} value - Amount to format
 * @returns {string} Formatted currency string (e.g. ₫50,000)
 */
export function formatMoney(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(numeric) ? Math.round(numeric) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Parses monetary input safely to numeric integer VND amount.
 * Returns 0 if invalid or non-numeric.
 *
 * @param {any} value
 * @returns {number}
 */
const FOREIGN_CURRENCY_PATTERN = /[$€£¥₹₩฿]|(?<![a-z])(USD|EUR|GBP|JPY|AUD|CAD|SGD|KRW|THB|CNY|RMB)(?![a-z])/i;
const VND_CURRENCY_PATTERN = /₫|VNĐ|VND|[đĐ]/gi;

/**
 * Parses monetary input safely to numeric VND amount.
 *
 * Rules:
 * - Rejects foreign currency markers ($, €, £, ¥, USD, EUR, etc.) with 0.
 * - Strips VND symbols (₫, đ, Đ, VND, VNĐ) and outer whitespace.
 * - Supports shorthand `k`/`K` thousands (e.g. `500k` -> 500000).
 * - Supports grouped thousands with `.` (`183.000`), `,` (`50,000`), or space (`50 000`).
 * - Preserves valid decimal inputs (`12.50`, `1,250.50`, `1.250,50`).
 * - Rejects malformed or ambiguous punctuation (`183.00.00`, `50 00`, `1,23,456`) with 0.
 *
 * @param {any} value
 * @returns {number}
 */
export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') return 0;

  const trimmed = value.trim();
  if (!trimmed || FOREIGN_CURRENCY_PATTERN.test(trimmed)) return 0;

  const withoutCurrency = trimmed.replace(VND_CURRENCY_PATTERN, '').trim();
  if (!withoutCurrency) return 0;

  let sign = 1;
  let body = withoutCurrency;
  if (body.startsWith('-')) {
    sign = -1;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) {
    body = body.slice(1).trim();
  }

  if (!body || /[+-]/.test(body)) return 0;

  const kMatch = body.match(/^(\d+(?:[.,]\d{1,2})?)\s*k$/i);
  if (kMatch) {
    const base = Number(kMatch[1].replace(',', '.'));
    return Number.isFinite(base) ? sign * Math.round(base * 1000) : 0;
  }

  let normalized = null;
  if (/^\d+$/.test(body)) {
    normalized = body;
  } else if (/^\d{1,3}( \d{3})+$/.test(body)) {
    normalized = body.replace(/ /g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(body)) {
    normalized = body.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(body)) {
    normalized = body.replace(/,/g, '');
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(body)) {
    normalized = body.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(body)) {
    normalized = body.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d+$/.test(body)) {
    normalized = body;
  }

  if (normalized === null) return 0;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? sign * numeric : 0;
}
