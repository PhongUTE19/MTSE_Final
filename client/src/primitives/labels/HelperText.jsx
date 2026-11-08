import React, { forwardRef } from 'react';
import Text from '../typography/Text.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Base HelperText component.
 * Standardizes auxiliary hints and descriptions for form fields.
 * Composes Base Text with variant="helper" and accessible ID linkage.
 * Arbitrary className and style overrides are strictly stripped per Strict Component Styling Policy.
 *
 * @param {object} props
 * @param {string} [props.id] - Optional ID for aria-describedby association
 * @param {'div'|'p'|'span'} [props.as='div'] - Element type to render
 * @param {React.ReactNode} props.children - Helper content
 */
const HelperText = forwardRef(function HelperText(
  {
    id,
    as = 'div',
    children,
    ...rest
  },
  ref
) {
  if (!children) return null;
  const domProps = omitProps(rest);

  return (
    <Text
      ref={ref}
      as={as}
      id={id}
      variant="helper"
      {...domProps}
    >
      {children}
    </Text>
  );
});

export default HelperText;
