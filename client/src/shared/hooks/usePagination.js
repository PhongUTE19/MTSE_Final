import { useState, useCallback, useMemo } from 'react';
import { calculatePagination, paginateItems } from '../utils/collectionUtils.js';

/**
 * Reusable hook to manage pagination state for both client-side collections
 * and server-side paginated queries.
 *
 * @param {object} [options={}]
 * @param {number} [options.initialPage=1] - Starting 1-indexed page
 * @param {number} [options.initialLimit=10] - Starting items per page
 * @param {number} [options.total=0] - Total count of records
 * @param {Function} [options.onChange] - Callback when page or limit changes
 * @returns {object} Pagination metrics, navigation methods, and state setters
 */
export function usePagination({
  initialPage = 1,
  initialLimit = 10,
  total = 0,
  onChange,
} = {}) {
  const [page, setPageState] = useState(initialPage);
  const [limit, setLimitState] = useState(initialLimit);

  const metrics = useMemo(() => {
    return calculatePagination({ total, page, limit });
  }, [total, page, limit]);

  const setPage = useCallback(
    (nextPage) => {
      const validMetrics = calculatePagination({ total, page: nextPage, limit });
      const safePage = validMetrics.page;
      setPageState(safePage);
      if (onChange) {
        onChange({ page: safePage, limit, offset: validMetrics.offset });
      }
    },
    [total, limit, onChange]
  );

  const setLimit = useCallback(
    (nextLimit) => {
      const safeLimit = Math.max(1, Number(nextLimit) || 10);
      setLimitState(safeLimit);
      setPageState(1);
      if (onChange) {
        onChange({ page: 1, limit: safeLimit, offset: 0 });
      }
    },
    [onChange]
  );

  const nextPage = useCallback(() => {
    if (metrics.hasNext) {
      setPage(metrics.page + 1);
    }
  }, [metrics.hasNext, metrics.page, setPage]);

  const prevPage = useCallback(() => {
    if (metrics.hasPrev) {
      setPage(metrics.page - 1);
    }
  }, [metrics.hasPrev, metrics.page, setPage]);

  const setOffset = useCallback(
    (offset) => {
      const computedPage = Math.floor(Math.max(0, Number(offset) || 0) / limit) + 1;
      setPage(computedPage);
    },
    [limit, setPage]
  );

  const paginate = useCallback(
    (items) => {
      return paginateItems(items, metrics.page, metrics.limit);
    },
    [metrics.page, metrics.limit]
  );

  return {
    page: metrics.page,
    limit: metrics.limit,
    offset: metrics.offset,
    total: metrics.total,
    totalPages: metrics.totalPages,
    fromIndex: metrics.fromIndex,
    toIndex: metrics.toIndex,
    hasPrev: metrics.hasPrev,
    hasNext: metrics.hasNext,
    setPage,
    setLimit,
    nextPage,
    prevPage,
    setOffset,
    paginate,
  };
}
