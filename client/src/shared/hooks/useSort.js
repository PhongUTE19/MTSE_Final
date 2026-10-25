import { useState, useCallback } from 'react';
import { sortItems } from '../utils/collectionUtils';

/**
 * Reusable hook to manage sorting state and apply sorting to client-side collections.
 *
 * @param {object} [options={}]
 * @param {string|null} [options.defaultKey=null] - Default active column sort key
 * @param {'asc'|'desc'|null} [options.defaultDirection='asc'] - Initial sort direction
 * @param {Record<string, Function>} [options.comparators={}] - Custom field comparator map
 * @returns {object} Sort state and helpers
 */
export function useSort({
  defaultKey = null,
  defaultDirection = 'asc',
  comparators = {},
} = {}) {
  const [sortState, setSortState] = useState({
    key: defaultKey,
    direction: defaultDirection,
  });

  const toggleSort = useCallback((key) => {
    setSortState((prev) => {
      if (prev.key !== key) {
        return { key, direction: 'asc' };
      }
      const nextDir = prev.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction: nextDir };
    });
  }, []);

  const setSort = useCallback((key, direction = 'asc') => {
    setSortState({ key, direction });
  }, []);

  const resetSort = useCallback(() => {
    setSortState({ key: defaultKey, direction: defaultDirection });
  }, [defaultKey, defaultDirection]);

  const applySort = useCallback(
    (items) => {
      return sortItems(items, sortState.key, sortState.direction, comparators);
    },
    [sortState.key, sortState.direction, comparators]
  );

  return {
    sortKey: sortState.key,
    sortDirection: sortState.direction,
    toggleSort,
    setSort,
    resetSort,
    applySort,
  };
}
