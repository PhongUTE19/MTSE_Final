const FOREIGN_CURRENCY_PATTERN = /[$€£¥₹₩฿]|(?<![a-z])(USD|EUR|GBP|JPY|AUD|CAD|SGD|KRW|THB|CNY|RMB)(?![a-z])/i;
const VND_CURRENCY_PATTERN = /₫|VNĐ|VND|[đĐ]/gi;
const ALL_CURRENCY_PATTERN = /[$€£¥₹₩฿₫]|VNĐ|VND|USD|EUR|GBP|JPY|AUD|CAD|SGD|KRW|THB|CNY|RMB|[đĐ]/gi;

/**
 * Parses a monetary string or number into a finite number, or null if invalid/ambiguous.
 *
 * @param {unknown} value
 * @param {{ allowForeignCurrency?: boolean, allowShorthandK?: boolean }} [options]
 * @returns {number|null}
 */
export function parseMonetaryAmount(
  value,
  { allowForeignCurrency = false, allowShorthandK = true } = {}
) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!allowForeignCurrency && FOREIGN_CURRENCY_PATTERN.test(trimmed)) {
    return null;
  }

  const withoutCurrency = trimmed
    .replace(allowForeignCurrency ? ALL_CURRENCY_PATTERN : VND_CURRENCY_PATTERN, '')
    .trim();
  if (!withoutCurrency) {
    return null;
  }

  let sign = 1;
  let body = withoutCurrency;
  if (body.startsWith('-')) {
    sign = -1;
    body = body.slice(1).trim();
  } else if (body.startsWith('+')) {
    body = body.slice(1).trim();
  }

  if (!body || /[+-]/.test(body)) {
    return null;
  }

  if (allowShorthandK) {
    const kMatch = body.match(/^(\d+(?:[.,]\d{1,2})?)\s*k$/i);
    if (kMatch) {
      const base = Number(kMatch[1].replace(',', '.'));
      return Number.isFinite(base) ? sign * Math.round(base * 1000) : null;
    }
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

  if (normalized === null) {
    return null;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? sign * num : null;
}

/**
 * Parses a VND-only monetary amount (rejects foreign currency markers).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseVndAmount(value) {
  return parseMonetaryAmount(value, { allowForeignCurrency: false, allowShorthandK: true });
}

/**
 * Parses a receipt monetary amount (allows foreign currency markers because receipt currency is tracked separately).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseReceiptAmount(value) {
  return parseMonetaryAmount(value, { allowForeignCurrency: true, allowShorthandK: true });
}
