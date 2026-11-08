import { useState, useCallback } from 'react';
import { fetchChunks } from '../knowledgeBase/knowledgeBaseApi';
import { APP_MESSAGES, PAGINATION } from '../../shared/constants';
import { usePagination, useSearch } from '../../shared/hooks';

/**
 * Custom hook to manage chunk inspection, pagination, and text searching.
 *
 * Configures reusable pagination and search primitives for server-side chunk queries.
 *
 * @param {Object} [options={}]
 * @param {Function} [options.onError] - Callback to report error feedback
 */
export function useChunks({ onError } = {}) {
  const [chunks, setChunks] = useState([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [chunksLoading, setChunksLoading] = useState(false);

  const pagination = usePagination({
    initialPage: 1,
    initialLimit: PAGINATION.DEFAULT_LIMIT,
    total: totalChunks,
  });

  const search = useSearch({
    initialQuery: '',
  });

  const loadChunksData = useCallback(
    async (
      limit = pagination.limit,
      offset = pagination.offset,
      query = search.searchQuery
    ) => {
      setChunksLoading(true);
      try {
        const chunksData = await fetchChunks({ limit, offset, search: query });
        setChunks(chunksData.chunks || []);
        setTotalChunks(chunksData.totalChunks || 0);
        setHasMore(Boolean(chunksData.hasMore));
        return chunksData;
      } catch (err) {
        if (onError) {
          onError(err.message || APP_MESSAGES.ERROR.LOAD_CHUNKS_FAILED);
        }
        throw err;
      } finally {
        setChunksLoading(false);
      }
    },
    [pagination.limit, pagination.offset, search.searchQuery, onError]
  );

  const handleSearchChange = useCallback(
    (newQuery) => {
      search.handleSearchChange(newQuery);
      pagination.setPage(1);
      loadChunksData(pagination.limit, 0, newQuery);
    },
    [search, pagination, loadChunksData]
  );

  const handleLimitChange = useCallback(
    (newLimit) => {
      pagination.setLimit(newLimit);
      loadChunksData(newLimit, 0, search.searchQuery);
    },
    [pagination, search.searchQuery, loadChunksData]
  );

  const handlePageChange = useCallback(
    (targetPage) => {
      pagination.setPage(targetPage);
      const targetOffset = (targetPage - 1) * pagination.limit;
      loadChunksData(pagination.limit, targetOffset, search.searchQuery);
    },
    [pagination, search.searchQuery, loadChunksData]
  );

  const handlePrevPage = useCallback(() => {
    if (pagination.hasPrev) {
      handlePageChange(pagination.page - 1);
    }
  }, [pagination.hasPrev, pagination.page, handlePageChange]);

  const handleNextPage = useCallback(() => {
    if (pagination.hasNext || hasMore) {
      handlePageChange(pagination.page + 1);
    }
  }, [pagination.hasNext, hasMore, pagination.page, handlePageChange]);

  const refreshChunks = useCallback(() => {
    return loadChunksData(pagination.limit, pagination.offset, search.searchQuery);
  }, [loadChunksData, pagination.limit, pagination.offset, search.searchQuery]);

  return {
    chunks,
    totalChunks,
    chunkLimit: pagination.limit,
    chunkOffset: pagination.offset,
    page: pagination.page,
    totalPages: pagination.totalPages,
    hasMore,
    chunkSearch: search.searchQuery,
    chunksLoading,
    loadChunksData,
    handleSearchChange,
    handleLimitChange,
    handlePageChange,
    handlePrevPage,
    handleNextPage,
    refreshChunks,
  };
}
