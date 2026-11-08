import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Footer subcomponent for Card.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='div'] - Element tag
 * @param {React.ReactNode} props.children - Footer contents
 */
export function CardFooter({ as: Component = 'div', children, ...rest }) {
  const domProps = omitProps(rest);

  return (
    <Component className="mt-3 pt-3 border-t border-border" {...domProps}>
      {children}
    </Component>
  );
}

export default CardFooter;
