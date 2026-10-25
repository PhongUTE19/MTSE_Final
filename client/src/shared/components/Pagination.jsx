import React from 'react';
import { PAGINATION, UI_LABELS } from '../constants';

/**
 * Reusable, accessible pagination toolbar component.
 *
 * Supports page navigation buttons, showing count indicators, and page-size selection.
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
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const computedTotalPages = totalPages ?? (safeTotal === 0 ? 1 : Math.ceil(safeTotal / safeLimit));
  const safePage = Math.max(1, Math.min(Number(page) || 1, computedTotalPages));

  const start = fromIndex ?? (safeTotal === 0 ? 0 : (safePage - 1) * safeLimit + 1);
  const end = toIndex ?? (safeTotal === 0 ? 0 : Math.min(safePage * safeLimit, safeTotal));

  const canPrev = safePage > 1 && !loading;
  const canNext = safePage < computedTotalPages && !loading;

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
          onClick={() => onPageChange(safePage - 1)}
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
          onClick={() => onPageChange(safePage + 1)}
          aria-label={UI_LABELS.COMMON.NEXT || 'Next page'}
        >
          {UI_LABELS.COMMON.NEXT || 'Next'}
        </button>
      </div>
    </nav>
  );
}
