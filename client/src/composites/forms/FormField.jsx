import React from 'react';
import Stack from '../../primitives/layout/Stack.jsx';
import Label from '../../primitives/labels/Label.jsx';
import { omitProps } from '../../shared/utils/domProps.js';
import HelperText from '../../primitives/labels/HelperText.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';

/**
 * Standardized FormField composite component.
 * Centralizes layout, label rendering, required indicators, helper text,
 * and accessible validation error messages by composing Base Stack and Label primitives
 * with strictly controlled layout and zero arbitrary styling escape hatches.
 *
 * @param {object} props
 * @param {string} [props.id] - Field ID for htmlFor and aria-describedby associations
 * @param {string} [props.label] - Field label text
 * @param {boolean} [props.required=false] - Whether to show required indicator
 * @param {string} [props.error] - Validation error message (rendered with role="alert")
 * @param {string} [props.helperText] - Supplementary hint or description
 * @param {boolean} [props.fullWidth=false] - Whether to span full container width
 * @param {React.ReactNode} props.children - Input control
 */
export default function FormField({
  id,
  label,
  required = false,
  error,
  helperText,
  fullWidth = false,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);
  const helperId = id ? `${id}-helper` : undefined;
  const errorId = id ? `${id}-error` : undefined;

  return (
    <Stack gap="2xs" fullWidth={fullWidth} {...domProps}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
      )}
      {children}
      {helperText && (
        /* Renders HelperText with standard form-helper-text styling */
        <HelperText id={helperId}>
          {helperText}
        </HelperText>
      )}
      {error && (
        <ErrorText id={errorId} role="alert">
          {error}
        </ErrorText>
      )}
    </Stack>
  );
}
