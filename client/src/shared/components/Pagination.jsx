import React, { useState, useEffect } from 'react';
import { PAGINATION, UI_LABELS } from '../constants';

/**
 * Reusable, accessible pagination toolbar component.
 *
 * Supports page navigation buttons, showing count indicators, page-size selection,
 * and direct page jump navigation.
 *
 * @param {object} props
 * @param {number} props.page - Active 1-indexed page
 * @param {number} props.limit - Items per page
 * @param {number} props.total - Total records count
 * @param {number} [props.totalPages] - Total available pages
 * @param {number} [props.fromIndex] - First item index displayed
 * @param {number} [props.toIndex] - Last item index displayed
 * @param {number[]} [props.pageSizeOptions=PAGINATION.OPTIONS] - Available limits
 * @param {Function} props.onPageChange - Callback when target page changes
 * @param {Function} [props.onLimitChange] - Callback when page size changes
 * @param {boolean} [props.loading=false] - Disables buttons while loading
 * @param {Function} [props.showingLabel] - Custom showing formatter: (from, to, total) => string
 * @param {string} [props.className='pagination-bar split-layout'] - Custom CSS class
 * @param {string} [props.ariaLabel='Pagination'] - Accessible navigation label
 * @param {boolean} [props.showGoToPage=false] - Renders direct page navigation input
 */
export default function Pagination({
  page = 1,
  limit = PAGINATION.DEFAULT_LIMIT,
  total = 0,
  totalPages,
  fromIndex,
  toIndex,
  pageSizeOptions = PAGINATION.OPTIONS,
  onPageChange,
  onLimitChange,
  loading = false,
  showingLabel,
  className = 'pagination-bar split-layout',
  ariaLabel = 'Pagination',
  showGoToPage = false,
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const computedTotalPages = totalPages ?? (safeTotal === 0 ? 1 : Math.ceil(safeTotal / safeLimit));
  const safePage = Math.max(1, Math.min(Number(page) || 1, computedTotalPages));

  const start = fromIndex ?? (safeTotal === 0 ? 0 : (safePage - 1) * safeLimit + 1);
  const end = toIndex ?? (safeTotal === 0 ? 0 : Math.min(safePage * safeLimit, safeTotal));

  const canPrev = safePage > 1 && !loading;
  const canNext = safePage < computedTotalPages && !loading;

  const [jumpPage, setJumpPage] = useState(String(safePage));

  useEffect(() => {
    setJumpPage(String(safePage));
  }, [safePage]);

  const handleJumpSubmit = (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!jumpPage || String(jumpPage).trim() === '') {
      setJumpPage(String(safePage));
      return;
    }
    const parsed = parseInt(jumpPage, 10);
    if (Number.isNaN(parsed)) {
      setJumpPage(String(safePage));
      return;
    }
    const targetPage = Math.max(1, Math.min(parsed, computedTotalPages));
    setJumpPage(String(targetPage));
    if (targetPage !== safePage && onPageChange) {
      onPageChange(targetPage);
    }
  };

  const defaultShowing = () => (
    <span>
      {UI_LABELS.COMMON.SHOWING || 'Showing'}{' '}
      <strong>{start}–{end}</strong>{' '}
      {UI_LABELS.COMMON.OF || 'of'}{' '}
      <strong>{safeTotal}</strong>
    </span>
  );

  return (
    <nav className={className} role="navigation" aria-label={ariaLabel}>
      <div className="pagination-info row-layout">
        {showingLabel ? (
          typeof showingLabel === 'function' ? (
            <span>{showingLabel(start, end, safeTotal)}</span>
          ) : (
            showingLabel
          )
        ) : (
          defaultShowing()
        )}

        {onLimitChange && Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0 && (
          <div className="row-layout pagination-page-size">
            <label htmlFor="pagination-size-select">
              {UI_LABELS.COMMON.PER_PAGE || 'Per page:'}
            </label>
            <select
              id="pagination-size-select"
              className="page-size-select"
              value={safeLimit}
              disabled={loading}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              aria-label="Select number of items per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-controls row-layout">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canPrev}
          onClick={() => onPageChange && onPageChange(safePage - 1)}
          aria-label={UI_LABELS.COMMON.PREVIOUS || 'Previous page'}
        >
          {UI_LABELS.COMMON.PREVIOUS || 'Previous'}
        </button>

        <span className="pagination-current-page" aria-current="page">
          {safePage} / {computedTotalPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canNext}
          onClick={() => onPageChange && onPageChange(safePage + 1)}
          aria-label={UI_LABELS.COMMON.NEXT || 'Next page'}
        >
          {UI_LABELS.COMMON.NEXT || 'Next'}
        </button>

        {showGoToPage && (
          <form
            className="row-layout pagination-go-to-page"
            onSubmit={handleJumpSubmit}
          >
            <label htmlFor="pagination-jump-input" className="pagination-jump-label">
              Go to page:
            </label>
            <input
              id="pagination-jump-input"
              type="number"
              min="1"
              max={computedTotalPages}
              className="page-jump-input"
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onBlur={handleJumpSubmit}
              disabled={loading || safeTotal === 0}
              aria-label="Go to specific page"
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={loading || safeTotal === 0 || !jumpPage}
              aria-label="Navigate to entered page"
            >
              Go
            </button>
          </form>
        )}
      </div>
    </nav>
  );
}
