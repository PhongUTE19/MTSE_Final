import React, { forwardRef } from 'react';
import { useTableVariant } from './Table.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

const HEADER_VARIANT_CLASSES = {
  default:
    'py-2.5 px-4 border-y border-border bg-surface-subtle text-content-muted text-xs leading-tight tracking-wide uppercase font-semibold align-middle',
  compact:
    'py-2 px-3 border-y border-border bg-surface-subtle text-content-muted text-xs leading-tight tracking-wide uppercase font-semibold whitespace-nowrap align-middle',
  comfortable:
    'py-3 px-5 border-y border-border bg-surface-subtle text-content-muted text-xs leading-tight tracking-wide uppercase font-semibold align-middle',
};

/**
 * TableHeaderCell Base Component.
 * Supports controlled text alignment and nowrap.
 *
 * @param {object} props
 * @param {'start'|'left'|'center'|'end'|'right'} [props.align='start'] - Header text alignment
 * @param {boolean} [props.nowrap=false] - Whether to prevent line wrapping
 * @param {boolean} [props.sticky=false] - Whether header cell sticks to top on scroll
 * @param {number} [props.colSpan] - Column span
 * @param {string} [props.scope='col'] - Header cell scope
 * @param {React.ReactNode} props.children - Header content
 */
export const TableHeaderCell = forwardRef(function TableHeaderCell(
  {
    align = 'start',
    nowrap = false,
    sticky = false,
    colSpan,
    scope = 'col',
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);
  const tableVariant = useTableVariant();

  const variantClass = HEADER_VARIANT_CLASSES[tableVariant] || HEADER_VARIANT_CLASSES.default;
  const alignClass =
    align === 'center'
      ? 'text-center'
      : align === 'end' || align === 'right'
        ? 'text-right'
        : 'text-left';

  const classes = [
    variantClass,
    alignClass,
    nowrap ? 'whitespace-nowrap' : null,
    sticky ? 'sticky top-0 z-table-header' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <th ref={ref} scope={scope} className={classes} colSpan={colSpan} {...domProps}>
      {children}
    </th>
  );
});

export default TableHeaderCell;
