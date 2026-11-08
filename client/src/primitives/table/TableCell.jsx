import React, { forwardRef } from 'react';
import { useTableVariant } from './Table.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

export const TABLE_CELL_VARIANTS = {
  default: '',
  positive: 'text-income font-bold',
  negative: 'text-expense font-bold',
  empty: 'p-10 text-center text-content-muted',
};

/**
 * TableCell Base Component.
 * Supports controlled text alignment, monospace formatting, nowrap, truncation, and semantic variants.
 *
 * @param {object} props
 * @param {'default'|'positive'|'negative'|'empty'} [props.variant='default'] - Semantic variant
 * @param {'start'|'left'|'center'|'end'|'right'} [props.align='start'] - Text alignment
 * @param {boolean} [props.mono=false] - Whether to use monospace font
 * @param {boolean} [props.nowrap=false] - Whether to prevent line wrapping
 * @param {boolean} [props.truncate=false] - Whether to truncate with ellipsis
 * @param {boolean} [props.muted=false] - Whether to apply muted text color
 * @param {number} [props.colSpan] - Column span
 * @param {React.ReactNode} props.children - Cell content
 */
export const TableCell = forwardRef(function TableCell(
  {
    variant = 'default',
    align = 'start',
    mono = false,
    nowrap = false,
    truncate = false,
    muted = false,
    colSpan,
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);
  const tableVariant = useTableVariant();

  const isEmpty = variant === 'empty';
  const paddingClass = isEmpty
    ? 'p-10'
    : tableVariant === 'comfortable'
      ? 'py-3.5 px-5'
      : tableVariant === 'compact'
        ? 'py-2 px-3'
        : 'py-2.5 px-4';

  let colorClass;
  if (variant === 'positive') {
    colorClass = 'text-income font-bold';
  } else if (variant === 'negative') {
    colorClass = 'text-expense font-bold';
  } else if (isEmpty || muted) {
    colorClass = 'text-content-muted';
  } else {
    colorClass = 'text-content-primary';
  }

  let alignClass = null;
  if (align === 'center' || isEmpty) {
    alignClass = 'text-center';
  } else if (align === 'end' || align === 'right') {
    alignClass = 'text-right';
  }

  const verticalAlignClass = 'align-middle';
  const smallTextClass =
    tableVariant === 'comfortable'
      ? '[&_small]:block [&_small]:max-w-cell-desc [&_small]:mt-0.5 [&_small]:truncate [&_small]:text-content-muted [&_small]:text-xs'
      : null;

  const classes = [
    'border-b border-border',
    paddingClass,
    colorClass,
    alignClass,
    verticalAlignClass,
    smallTextClass,
    mono ? 'font-mono' : null,
    nowrap ? 'whitespace-nowrap' : null,
    truncate ? 'overflow-hidden text-ellipsis whitespace-nowrap max-w-cell-truncate' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td ref={ref} className={classes} colSpan={colSpan} {...domProps}>
      {children}
    </td>
  );
});

export default TableCell;
