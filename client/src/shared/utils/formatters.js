import { UI_LABELS } from '../constants/index.js';

/**
 * Formats section display title based on chunk or source metadata.
 *
 * @param {{ title?: string, sectionNumber?: number | string, sectionTitle?: string }} item
 * @returns {string} Formatted section title
 */
export function formatSectionTitle(item) {
  if (!item) return UI_LABELS.ANSWER_SECTION.DEFAULT_SECTION_TITLE;
  if (item.title) return item.title;
  if (item.sectionNumber) {
    return `${UI_LABELS.ANSWER_SECTION.SECTION_PREFIX} ${item.sectionNumber}: ${item.sectionTitle || ''}`;
  }
  return UI_LABELS.ANSWER_SECTION.DEFAULT_SECTION_TITLE;
}

/**
 * Formats a similarity score to a fixed precision.
 *
 * @param {number|string|undefined|null} score - Similarity score
 * @param {number} [precision=4] - Decimal places
 * @returns {string} Formatted score
 */
export function formatScore(score, precision = 4) {
  if (score === undefined || score === null) return '';
  return typeof score === 'number' ? score.toFixed(precision) : String(score);
}

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
export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}
