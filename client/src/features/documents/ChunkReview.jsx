import React from 'react';
import ChunkCard from './ChunkCard';
import Pagination from '../../shared/components/Pagination';
import SearchInput from '../../shared/components/SearchInput';
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

  const showingLabel = (from, to, total) => (
    <span>
      {UI_LABELS.CHUNK_REVIEW.SHOWING} <strong>{from}–{to}</strong>{' '}
      {UI_LABELS.CHUNK_REVIEW.OF} <strong>{total}</strong>{' '}
      {UI_LABELS.CHUNK_REVIEW.CHUNKS}
    </span>
  );

  return (
    <div>
      <SearchInput
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
        showingLabel={showingLabel}
        ariaLabel="Chunks pagination"
      />

      {loading ? (
        <div className="empty-state">
          <span className="spinner"></span> {UI_LABELS.CHUNK_REVIEW.LOADING_CHUNKS}
        </div>
      ) : chunks.length === 0 ? (
        <div className="empty-state">
          {searchQuery
            ? UI_LABELS.CHUNK_REVIEW.NO_MATCHING_CHUNKS
            : UI_LABELS.CHUNK_REVIEW.NO_CHUNKS_AVAILABLE}
        </div>
      ) : (
        <div className="card-list">
          {chunks.map((chunk) => (
            <ChunkCard key={chunk.id} chunk={chunk} />
          ))}
        </div>
      )}
    </div>
  );
}
