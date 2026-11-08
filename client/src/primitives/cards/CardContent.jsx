import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Content/Body subcomponent for Card.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='div'] - Element tag
 * @param {React.ReactNode} props.children - Body contents
 */
export function CardContent({ as: Component = 'div', children, ...rest }) {
  const domProps = omitProps(rest);

  return (
    <Component className="mt-2" {...domProps}>
      {children}
    </Component>
  );
}

export default CardContent;
