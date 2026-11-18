import React, { useState, useEffect } from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Text from '../../primitives/typography/Text.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import { PAGINATION, UI_LABELS } from '../../shared/constants';
import { omitProps } from '../../shared/utils/domProps.js';
import ItemRangeSummary from '../dataDisplay/ItemRangeSummary.jsx';
import PageSizeSelector from '../dataDisplay/PageSizeSelector.jsx';

/**
 * Canonical reusable pagination component.
 * Standardizes item range summaries, per-page limit selection, page navigation,
 * and optional direct jump-to-page controls.
 *
 * @param {object} props
 * @param {number} [props.page=1] - Active 1-indexed page
 * @param {number} [props.limit=10] - Items per page
 * @param {number} [props.total=0] - Total records count
 * @param {number} [props.totalPages] - Total available pages
 * @param {number} [props.fromIndex] - First item index displayed
 * @param {number} [props.toIndex] - Last item index displayed
 * @param {number[]} [props.pageSizeOptions=PAGINATION.OPTIONS] - Available limits
 * @param {Function} props.onPageChange - Callback when target page changes
 * @param {Function} [props.onLimitChange] - Callback when page size changes
 * @param {boolean} [props.loading=false] - Disables buttons while loading
 * @param {Function} [props.showingLabel] - Custom showing formatter: (from, to, total) => string
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
  ariaLabel = 'Pagination',
  ...rest
}) {
  const domProps = omitProps(rest);
  const navClasses = 'flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border max-mobile:flex-col max-mobile:items-stretch';
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const computedTotalPages = Math.max(
    1,
    totalPages ?? (safeTotal === 0 ? 1 : Math.ceil(safeTotal / safeLimit))
  );
  const safePage = Math.max(1, Math.min(Number(page) || 1, computedTotalPages));

  const start = fromIndex ?? (safeTotal === 0 ? 0 : (safePage - 1) * safeLimit + 1);
  const end = toIndex ?? (safeTotal === 0 ? 0 : Math.min(safePage * safeLimit, safeTotal));

  const canPrev = safeTotal > 0 && safePage > 1 && !loading;
  const canNext = safeTotal > 0 && safePage < computedTotalPages && !loading;

  const [jumpPage, setJumpPage] = useState(String(safePage));

  useEffect(() => {
    setJumpPage(String(safePage));
  }, [safePage]);

  const handleJumpSubmit = (e) => {
    if (e?.preventDefault) {
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
    const target = Math.max(1, Math.min(parsed, computedTotalPages));
    setJumpPage(String(target));
    if (target !== safePage && onPageChange) {
      onPageChange(target);
    }
  };

  const defaultShowing = () => (
    <ItemRangeSummary start={start} end={end} total={safeTotal} />
  );

  const renderShowingLabel = () => {
    if (!showingLabel) return defaultShowing();
    if (typeof showingLabel === 'function') {
      return <span className="whitespace-nowrap shrink-0">{showingLabel(start, end, safeTotal)}</span>;
    }
    return showingLabel;
  };

  return (
    <nav className={navClasses} role="navigation" aria-label={ariaLabel} {...domProps}>
      <Inline gap="sm" align="center" wrap>
        {renderShowingLabel()}

        {onLimitChange && Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0 && (
          <PageSizeSelector
            id="pagination-size-select"
            value={safeLimit}
            disabled={loading}
            onChange={onLimitChange}
            options={pageSizeOptions}
            label={UI_LABELS.COMMON.PER_PAGE || 'Per page:'}
          />
        )}
      </Inline>

      <Inline gap="sm" align="center" wrap>
        <Button
          type="button"
          variant="primary"
          disabled={!canPrev}
          onClick={() => onPageChange && onPageChange(safePage - 1)}
          aria-label={UI_LABELS.COMMON.PREVIOUS || 'Previous page'}
        >
          {UI_LABELS.COMMON.PREVIOUS || 'Previous'}
        </Button>

        <form className="inline-flex items-center gap-1.5" onSubmit={handleJumpSubmit}>
          <Inline gap="sm" align="center" wrap>
            <Label htmlFor="pagination-jump-input">Page:</Label>
            <div className="w-page-jump">
              <TextInput
                id="pagination-jump-input"
                type="number"
                min="1"
                max={computedTotalPages}
                size="sm"
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value)}
                onBlur={handleJumpSubmit}
                disabled={loading || safeTotal === 0}
                aria-label="Go to specific page"
              />
            </div>
         
            <Text as="span" variant="secondary" size="xs" weight="medium" aria-current="page">
               / {computedTotalPages}
            </Text>
          </Inline>
        </form>

        <Button
          type="button"
          variant="primary"
          disabled={!canNext}
          onClick={() => onPageChange && onPageChange(safePage + 1)}
          aria-label={UI_LABELS.COMMON.NEXT || 'Next page'}
        >
          {UI_LABELS.COMMON.NEXT || 'Next'}
        </Button>
      </Inline>
    </nav>
  );
}
