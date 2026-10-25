import { z } from 'zod';

/**
 * Parses integer parameters from query string with defaults and clamping.
 * Preserves exact parseInt semantics, including decimal truncation,
 * partial numeric parsing ("12abc"), negative clamping, and array handling.
 *
 * @param {unknown} val - Raw query parameter value
 * @param {number} defaultVal - Default integer value
 * @param {number} [minVal] - Minimum bound
 * @param {number} [maxVal] - Maximum bound
 * @returns {number} Clamped integer
 */
export function parseIntegerParam(val, defaultVal, minVal, maxVal) {
  if (val === undefined || val === null) return defaultVal;
  const raw = Array.isArray(val) ? val[0] : val;
  const str = typeof raw === 'string' ? raw.trim() : String(raw);
  if (!str) return defaultVal;
  const parsed = parseInt(str, 10);
  if (isNaN(parsed) || (minVal !== undefined && parsed < minVal)) {
    return defaultVal;
  }
  if (maxVal !== undefined && parsed > maxVal) {
    return maxVal;
  }
  return parsed;
}

/**
 * Resolves search keyword from query parameters ('q' or 'search').
 *
 * @param {unknown} q - 'q' query parameter
 * @param {unknown} search - 'search' query parameter
 * @returns {string} Trimmed search query string
 */
export function parseSearchParam(q, search) {
  const raw = q !== undefined && q !== '' ? q : search;
  if (raw === undefined || raw === null) return '';
  const val = Array.isArray(raw) ? raw[0] : raw;
  return typeof val === 'string' ? val.trim() : String(val).trim();
}

/**
 * Creates a reusable Zod integer query parameter schema with automatic parsing,
 * default value fallbacks, and boundary clamping.
 *
 * @param {object} options
 * @param {number} options.defaultValue - Default integer when omitted or invalid
 * @param {number} [options.min] - Minimum boundary
 * @param {number} [options.max] - Maximum boundary
 * @returns {import('zod').ZodType<number>}
 */
export function zodIntegerParam({ defaultValue, min, max } = {}) {
  return z.preprocess(
    (val) => parseIntegerParam(val, defaultValue, min, max),
    z.number().int().default(defaultValue)
  );
}
