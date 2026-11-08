import React, { forwardRef } from 'react';
import Text from '../typography/Text.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Base ErrorText component.
 * Standardizes validation error messages and accessibility announcements across form fields.
 * Composes Base Text with variant="error", role="alert", and explicit element tags.
 * Arbitrary className and style overrides are strictly stripped per Strict Component Styling Policy.
 *
 * @param {object} props
 * @param {string} [props.id] - Optional ID for aria-errormessage or aria-describedby association
 * @param {'div'|'p'|'span'} [props.as='div'] - Element type to render
 * @param {string} [props.role='alert'] - Accessibility role for live error announcement
 * @param {React.ReactNode} props.children - Error message content
 */
const ErrorText = forwardRef(function ErrorText(
  {
    id,
    as = 'div',
    role = 'alert',
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
      variant="error"
      role={role}
      {...domProps}
    >
      {children}
    </Text>
  );
});

export default ErrorText;
