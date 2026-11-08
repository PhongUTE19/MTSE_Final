import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * TableRow Base Component.
 *
 * @param {object} props
 * @param {boolean} [props.selected=false] - Whether row is selected
 * @param {Function} [props.onClick] - Optional click handler
 * @param {React.ReactNode} props.children - Row cells
 */
export const TableRow = forwardRef(function TableRow(
  { selected = false, onClick, children, ...rest },
  ref
) {
  const domProps = omitProps(rest);

  const classes = [
    'border-b border-border last:border-b-0 transition-colors duration-100 hover:bg-surface-subtle',
    onClick ? 'cursor-pointer' : '',
    selected ? 'bg-info-bg hover:bg-info-bg' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <tr ref={ref} className={classes} onClick={onClick} {...domProps}>
      {children}
    </tr>
  );
});

export default TableRow;
