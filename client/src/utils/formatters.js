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
 * Formats an ISO date-time string to readable YYYY-MM-DD HH:mm:ss.
 *
 * @param {string|null|undefined} isoString - ISO timestamp
 * @returns {string} Formatted timestamp or dash
 */
export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return isoString;
  }
}

/**
 * Formats a monetary number in VND currency.
 *
 * @param {number|string|null|undefined} value - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value || 0);
}
