import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * TableBody Base Component.
 */
export const TableBody = forwardRef(function TableBody({ children, ...rest }, ref) {
  const domProps = omitProps(rest);
  return (
    <tbody ref={ref} {...domProps}>
      {children}
    </tbody>
  );
});

export default TableBody;
