export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that a YYYY-MM-DD string represents a real calendar date without UTC rollover.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidIsoCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === m - 1 &&
    utc.getUTCDate() === d
  );
}

/**
 * Returns today's YYYY-MM-DD calendar date in Vietnam (Asia/Ho_Chi_Minh).
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function getVietnamDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}
