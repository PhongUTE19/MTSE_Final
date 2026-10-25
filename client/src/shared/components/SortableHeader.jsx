import React from 'react';
import { UI_LABELS } from '../constants';

/**
 * Visual sort indicator symbols.
 */
export const SORT_ICONS = Object.freeze({
  INACTIVE: '⇅',
  ASCENDING: '▲',
  DESCENDING: '▼',
});

/**
 * Reusable accessible table column header with sort indicators.
 *
 * @param {object} props
 * @param {string} props.columnKey - Unique identifier for this column
 * @param {string|null} [props.currentSortKey] - Active sort column key
 * @param {'asc'|'desc'|null} [props.currentDirection] - Active sort direction
 * @param {Function} props.onSort - Sort trigger callback: (columnKey) => void
 * @param {React.ReactNode} props.children - Header text or elements
 * @param {string} [props.className] - Optional custom CSS class for <th>
 * @param {string} [props.title] - Optional title for tooltip
 */
export default function SortableHeader({
  columnKey,
  currentSortKey,
  currentDirection,
  onSort,
  children,
  className = '',
  title,
}) {
  const isActive = currentSortKey === columnKey && Boolean(currentDirection);
  const ariaSort = !isActive
    ? 'none'
    : currentDirection === 'asc'
      ? 'ascending'
      : 'descending';

  const sortIcon = !isActive
    ? SORT_ICONS.INACTIVE
    : currentDirection === 'asc'
      ? SORT_ICONS.ASCENDING
      : SORT_ICONS.DESCENDING;

  const indicatorClassName = !isActive
    ? 'sort-indicator sort-indicator--inactive'
    : 'sort-indicator sort-indicator--active';

  const headerLabel = typeof children === 'string' ? children : columnKey;
  const buttonTitle =
    title ||
    (UI_LABELS.COMMON.SORT_BY
      ? UI_LABELS.COMMON.SORT_BY(headerLabel)
      : `Sort by ${headerLabel}`);

  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="sort-header-btn"
        onClick={() => onSort(columnKey)}
        title={buttonTitle}
        aria-label={`${buttonTitle} (${ariaSort})`}
      >
        <span>{children}</span>
        <span className={indicatorClassName} aria-hidden="true">
          {sortIcon}
        </span>
      </button>
    </th>
  );
}
