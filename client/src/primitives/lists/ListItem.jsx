import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * ListItem Base Component.
 */
export const ListItem = forwardRef(function ListItem(
  { as: Component = 'li', children, ...rest },
  ref
) {
  const domProps = omitProps(rest);

  return (
    <Component ref={ref} className="m-0 p-0" {...domProps}>
      {children}
    </Component>
  );
});

export default ListItem;
