import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * TableHead Base Component.
 */
export const TableHead = forwardRef(function TableHead({ children, ...rest }, ref) {
  const domProps = omitProps(rest);
  return (
    <thead ref={ref} {...domProps}>
      {children}
    </thead>
  );
});

export default TableHead;
