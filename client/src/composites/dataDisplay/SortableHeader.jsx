import React from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import TableHeaderCell from '../../primitives/table/TableHeaderCell.jsx';
import { UI_LABELS } from '../../shared/constants';

/**
 * Presentation of each sort state: the aria-sort value, the visual indicator,
 * and the indicator's active/inactive styling.
 */
const SORT_STATES = Object.freeze({
  none: {
    ariaSort: 'none',
    icon: '⇅',
    indicatorClassName: 'text-2xs leading-none opacity-55 text-content-muted transition-opacity duration-150',
  },
  asc: {
    ariaSort: 'ascending',
    icon: '▲',
    indicatorClassName: 'text-2xs leading-none opacity-100 text-brand transition-opacity duration-150',
  },
  desc: {
    ariaSort: 'descending',
    icon: '▼',
    indicatorClassName: 'text-2xs leading-none opacity-100 text-brand transition-opacity duration-150',
  },
});

function resolveSortState(isActive, direction) {
  if (!isActive) return SORT_STATES.none;
  return direction === 'asc' ? SORT_STATES.asc : SORT_STATES.desc;
}

/**
 * Reusable accessible table column header with sort indicators.
 * Composes Base Button component.
 *
 * @param {object} props
 * @param {string} props.columnKey - Unique identifier for this column
 * @param {string|null} [props.currentSortKey] - Active sort column key
 * @param {'asc'|'desc'|null} [props.currentDirection] - Active sort direction
 * @param {Function} props.onSort - Sort trigger callback: (columnKey) => void
 * @param {'start'|'left'|'center'|'end'|'right'} [props.align='start'] - Header text alignment
 * @param {boolean} [props.nowrap=false] - Whether to prevent line wrapping
 * @param {boolean} [props.sticky=false] - Whether header cell sticks to top on scroll
 * @param {React.ReactNode} props.children - Header text or elements
 * @param {string} [props.title] - Optional title for tooltip
 */
export default function SortableHeader({
  columnKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = 'start',
  nowrap = false,
  sticky = false,
  children,
  title,
}) {
  const isActive = currentSortKey === columnKey && Boolean(currentDirection);
  const { ariaSort, icon, indicatorClassName } = resolveSortState(isActive, currentDirection);

  const headerLabel = typeof children === 'string' ? children : columnKey;
  const buttonTitle = title || UI_LABELS.COMMON.SORT_BY(headerLabel);

  return (
    <TableHeaderCell align={align} nowrap={nowrap} sticky={sticky} aria-sort={ariaSort}>
      <Button
        type="button"
        variant="table-header"
        onClick={() => onSort(columnKey)}
        title={buttonTitle}
        aria-label={`${buttonTitle} (${ariaSort})`}
      >
        <span>{children}</span>
        <span className={indicatorClassName} aria-hidden="true">
          {icon}
        </span>
      </Button>
    </TableHeaderCell>
  );
}
