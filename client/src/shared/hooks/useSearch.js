import { useState, useCallback } from 'react';
import { filterItems } from '../utils/collectionUtils';
import { validateSearchQuery } from '../utils/validation';

/**
 * Reusable hook to manage search query state, sanitization, and client filtering.
 *
 * @param {object} [options={}]
 * @param {string} [options.initialQuery=''] - Starting search query
 * @param {string[]} [options.searchFields=[]] - Property fields to search across
 * @param {Function} [options.onSearch] - Optional callback triggered on query change
 * @returns {object} Search state and filter helpers
 */
export function useSearch({
  initialQuery = '',
  searchFields = [],
  onSearch,
} = {}) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  const handleSearchChange = useCallback(
    (newQuery) => {
      const val = validateSearchQuery(newQuery);
      const sanitized = val.value !== undefined ? val.value : (newQuery || '').slice(0, 200);
      setSearchQuery(sanitized);
      if (onSearch) {
        onSearch(sanitized);
      }
    },
    [onSearch]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    if (onSearch) {
      onSearch('');
    }
  }, [onSearch]);

  const applyFilter = useCallback(
    (items) => {
      return filterItems(items, searchQuery, searchFields);
    },
    [searchQuery, searchFields]
  );

  return {
    searchQuery,
    setSearchQuery,
    handleSearchChange,
    clearSearch,
    applyFilter,
  };
}
