import React from 'react';
import ChunkCard from './ChunkCard';
import Pagination from '../../composites/navigation/Pagination.jsx';
import { SearchField } from '../../composites/filters/index.js';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import { UI_LABELS, PAGINATION } from '../../shared/constants';

export default function ChunkReview({
  chunks,
  totalChunks,
  limit,
  offset,
  hasMore,
  page,
  totalPages: propTotalPages,
  searchQuery,
  loading,
  onSearchChange,
  onLimitChange,
  onPageChange,
  onPrevPage,
  onNextPage,
}) {
  const currentPage = page ?? (Math.floor((offset || 0) / (limit || 10)) + 1);
  const totalPages = propTotalPages ?? (totalChunks === 0 ? 1 : Math.ceil(totalChunks / limit));


  const handlePageChange = (newPage) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else if (newPage < currentPage && onPrevPage) {
      onPrevPage();
    } else if (newPage > currentPage && onNextPage) {
      onNextPage();
    }
  };

  return (
    <Stack gap="md">
      <SearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder={UI_LABELS.CHUNK_REVIEW.SEARCH_PLACEHOLDER}
        ariaLabel={UI_LABELS.CHUNK_REVIEW.SEARCH_PLACEHOLDER}
      />

      {/* Reusable Pagination Controls Bar */}
      <Pagination
        page={currentPage}
        limit={limit}
        total={totalChunks}
        totalPages={totalPages}
        pageSizeOptions={PAGINATION.OPTIONS}
        onPageChange={handlePageChange}
        onLimitChange={onLimitChange}
        loading={loading}
        ariaLabel="Chunks pagination"
      />

      {loading && (
        <EmptyState>
          <Spinner /> {UI_LABELS.CHUNK_REVIEW.LOADING_CHUNKS}
        </EmptyState>
      )}

      {!loading && chunks.length === 0 && (
        <EmptyState
          message={
            searchQuery
              ? UI_LABELS.CHUNK_REVIEW.NO_MATCHING_CHUNKS
              : UI_LABELS.CHUNK_REVIEW.NO_CHUNKS_AVAILABLE
          }
        />
      )}

      {!loading && chunks.length > 0 && (
        <Stack gap="xs">
          {chunks.map((chunk) => (
            <ChunkCard key={chunk.id} chunk={chunk} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
