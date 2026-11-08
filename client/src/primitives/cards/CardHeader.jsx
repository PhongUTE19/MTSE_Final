import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Header subcomponent for Card.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='div'] - Element tag
 * @param {React.ReactNode} props.children - Header contents
 */
export function CardHeader({ as: Component = 'div', children, ...rest }) {
  const domProps = omitProps(rest);

  return (
    <Component className="mb-3" {...domProps}>
      {children}
    </Component>
  );
}

export default CardHeader;
