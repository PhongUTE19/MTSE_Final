import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const BASE_INPUT_CLASSES =
  'w-full border rounded-md font-sans text-content-primary bg-surface transition-input duration-150 placeholder:text-content-muted focus:outline-none disabled:bg-surface-muted disabled:text-content-muted disabled:cursor-not-allowed';

const INPUT_SIZES = Object.freeze({
  sm: 'min-h-control-sm px-2.5 py-1 text-xs',
  md: 'min-h-control px-3 py-2 text-base',
  lg: 'min-h-nav-item px-3.5 py-2.5 text-base',
});

const END_PADDING_CLASSES = Object.freeze({
  none: '',
  sm: 'pr-9',
  lg: 'pr-16',
});

/**
 * Base TextInput component for single-line text, number, date, email, etc.
 * Standardizes form input styling, sizing, disabled states, and accessibility across SpendWise.
 *
 * @param {object} props
 * @param {string} [props.type='text'] - HTML input type (text, number, date, email, search, etc.)
 * @param {string|number} [props.value] - Controlled value
 * @param {string|number} [props.defaultValue] - Uncontrolled default value
 * @param {function} [props.onChange] - Change handler
 * @param {string} [props.id] - HTML element ID
 * @param {string} [props.name] - Form field name
 * @param {string} [props.placeholder] - Placeholder text
 * @param {boolean} [props.disabled=false] - Whether input is disabled
 * @param {boolean} [props.readOnly=false] - Whether input is read-only
 * @param {boolean} [props.required=false] - Whether input is required
 * @param {boolean} [props.invalid=false] - Whether input has validation error (sets aria-invalid)
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Sizing modifier
 * @param {'none'|'sm'|'lg'} [props.endPadding='none'] - Extra trailing padding for overlaid controls
 */
const TextInput = forwardRef(function TextInput(
  {
    type = 'text',
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    size = 'md',
    endPadding = 'none',
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref
) {
  // Strip arbitrary styling props (className and style) to enforce Design System control
  const domProps = omitProps(rest);

  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  const sizeClass = INPUT_SIZES[size] || INPUT_SIZES.md;
  const endPaddingClass = END_PADDING_CLASSES[endPadding] || '';
  const stateClass = isInvalid
    ? 'border-error-accent focus:border-error-accent focus:shadow-focus-danger'
    : 'border-border focus:border-brand focus:shadow-focus';

  const classes = [BASE_INPUT_CLASSES, sizeClass, endPaddingClass, stateClass].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-invalid={isInvalid ? 'true' : undefined}
      {...domProps}
    />
  );
});

export default TextInput;
