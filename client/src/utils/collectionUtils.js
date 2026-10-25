/**
 * Pure utilities for collection manipulation: search, filtering, sorting, and pagination.
 *
 * Designed to support both in-memory client-side collections and server-side query coordinators.
 */

/**
 * Calculates standardized pagination metrics from total count, page, and limit.
 *
 * @param {object} params
 * @param {number} [params.total=0] - Total number of available records
 * @param {number} [params.page=1] - Current active 1-indexed page
 * @param {number} [params.limit=10] - Number of items per page
 * @param {number} [params.offset=null] - Optional 0-indexed offset (used if page not provided)
 * @returns {{
 *   page: number,
 *   limit: number,
 *   offset: number,
 *   total: number,
 *   totalPages: number,
 *   fromIndex: number,
 *   toIndex: number,
 *   hasPrev: boolean,
 *   hasNext: boolean
 * }}
 */
export function calculatePagination({ total = 0, page = 1, limit = 10, offset = null } = {}) {
  const safeLimit = Math.max(1, Number(limit) || 10);
  const safeTotal = Math.max(0, Number(total) || 0);

  // If offset is explicitly provided and page is default, calculate page from offset
  let targetPage = page;
  if (offset !== null && offset !== undefined) {
    targetPage = Math.floor(Math.max(0, Number(offset)) / safeLimit) + 1;
  }

  const totalPages = safeTotal === 0 ? 1 : Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.max(1, Math.min(Number(targetPage) || 1, totalPages));
  const safeOffset = (safePage - 1) * safeLimit;

  const fromIndex = safeTotal === 0 ? 0 : safeOffset + 1;
  const toIndex = safeTotal === 0 ? 0 : Math.min(safeOffset + safeLimit, safeTotal);

  return {
    page: safePage,
    limit: safeLimit,
    offset: safeOffset,
    total: safeTotal,
    totalPages,
    fromIndex,
    toIndex,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/**
 * Slices an in-memory array for the specified page and limit.
 *
 * @template T
 * @param {T[]} items - Array of items
 * @param {number} [page=1] - 1-indexed page number
 * @param {number} [limit=10] - Number of items per page
 * @returns {T[]} Paginated slice of items
 */
export function paginateItems(items = [], page = 1, limit = 10) {
  if (!Array.isArray(items)) return [];
  const safeLimit = Math.max(1, Number(limit) || 10);
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safeLimit;
  return items.slice(start, start + safeLimit);
}

/**
 * Helper to resolve nested property paths (e.g. 'tokenUsage.totalTokens').
 *
 * @param {object} obj - Source object
 * @param {string} path - Property path
 * @returns {any} Resolved value or undefined
 */
export function getNestedValue(obj, path) {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  if (path in obj) return obj[path];

  const keys = String(path).split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Filters an array of items by a search query across specified object fields.
 *
 * @template T
 * @param {T[]} items - Array of items to filter
 * @param {string} query - Keyword search term
 * @param {string[]} [searchFields=[]] - Specific property keys or paths to search
 * @returns {T[]} Filtered array of items
 */
export function filterItems(items = [], query = '', searchFields = []) {
  if (!Array.isArray(items)) return [];
  if (!query || typeof query !== 'string') return [...items];

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...items];

  return items.filter((item) => {
    if (item == null) return false;

    // If specific fields are specified, only search within those
    if (Array.isArray(searchFields) && searchFields.length > 0) {
      return searchFields.some((field) => {
        const val = getNestedValue(item, field);
        if (val == null) return false;
        return String(val).toLowerCase().includes(trimmed);
      });
    }

    // Default: search all primitive string/number values of the item
    if (typeof item === 'object') {
      return Object.values(item).some((val) => {
        if (val == null) return false;
        if (typeof val === 'object') return false; // avoid searching nested objects directly
        return String(val).toLowerCase().includes(trimmed);
      });
    }

    return String(item).toLowerCase().includes(trimmed);
  });
}

/**
 * Sorts an array of items by a given key and direction, supporting strings,
 * numbers, dates, null values, and custom comparators.
 *
 * @template T
 * @param {T[]} items - Array of items to sort
 * @param {string|null} sortKey - Object property path to sort by
 * @param {'asc'|'desc'|null|'none'} [sortDirection='asc'] - Sort order
 * @param {Record<string, (a: T, b: T, dir: string) => number>} [comparators={}] - Custom comparators
 * @returns {T[]} Newly sorted array (non-mutating)
 */
export function sortItems(items = [], sortKey = null, sortDirection = 'asc', comparators = {}) {
  if (!Array.isArray(items)) return [];
  if (!sortKey || !sortDirection || sortDirection === 'none') {
    return [...items];
  }

  const isDesc = sortDirection === 'desc';
  const customComparator = comparators?.[sortKey];

  return [...items].sort((a, b) => {
    if (typeof customComparator === 'function') {
      return customComparator(a, b, sortDirection);
    }

    const valA = getNestedValue(a, sortKey);
    const valB = getNestedValue(b, sortKey);

    // Nulls and undefined always sort to bottom regardless of direction
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;

    // Numeric comparison
    if (typeof valA === 'number' && typeof valB === 'number') {
      return isDesc ? valB - valA : valA - valB;
    }

    // Date comparison
    if (valA instanceof Date && valB instanceof Date) {
      return isDesc ? valB.getTime() - valA.getTime() : valA.getTime() - valB.getTime();
    }

    // ISO date string comparison heuristic (if values look like ISO dates)
    if (
      typeof valA === 'string' &&
      typeof valB === 'string' &&
      /^\d{4}-\d{2}-\d{2}/.test(valA) &&
      /^\d{4}-\d{2}-\d{2}/.test(valB)
    ) {
      const timeA = Date.parse(valA);
      const timeB = Date.parse(valB);
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
        return isDesc ? timeB - timeA : timeA - timeB;
      }
    }

    // Standard string comparison
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    const cmp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    return isDesc ? -cmp : cmp;
  });
}

/**
 * Calculates the next sort direction when cycling through headers.
 * (none -> 'asc' -> 'desc' -> null)
 *
 * @param {'asc'|'desc'|null|'none'} currentDirection
 * @returns {'asc'|'desc'|null} Next direction
 */
export function getNextSortDirection(currentDirection) {
  if (!currentDirection || currentDirection === 'none') return 'asc';
  if (currentDirection === 'asc') return 'desc';
  return null;
}

/**
 * Serializes an object of parameters into a URL query string, omitting empty,
 * null, undefined values, and optional ignore values (e.g. 'all').
 * Handles arrays, dates, numbers, and strings cleanly.
 *
 * @param {Record<string, any>} [params={}] - Parameters object
 * @param {object} [options={}]
 * @param {boolean} [options.prefix=true] - Whether to prepend '?' when non-empty
 * @param {any[]} [options.ignoreValues=['', null, undefined]] - Values to filter out
 * @returns {string} Serialized query string (e.g. "?page=1&type=expense" or "")
 */
export function toQueryString(params = {}, { prefix = true, ignoreValues = ['', null, undefined] } = {}) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  const ignoreSet = new Set(ignoreValues);

  for (const [key, value] of Object.entries(params)) {
    if (ignoreSet.has(value)) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (!ignoreSet.has(item)) {
          searchParams.append(key, String(item));
        }
      }
    } else if (value instanceof Date) {
      searchParams.set(key, value.toISOString());
    } else {
      searchParams.set(key, String(value));
    }
  }

  const qs = searchParams.toString();
  return qs ? (prefix ? `?${qs}` : qs) : '';
}
