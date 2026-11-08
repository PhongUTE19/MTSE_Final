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
