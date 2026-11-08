import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const BASE_TEXTAREA_CLASSES =
  'w-full border rounded-md font-sans text-content-primary bg-surface transition-input duration-150 placeholder:text-content-muted focus:outline-none disabled:bg-surface-muted disabled:text-content-muted disabled:cursor-not-allowed px-3 py-2 leading-normal';

const TEXTAREA_SIZES = Object.freeze({
  sm: 'text-sm',
  md: 'text-base',
});

const TEXTAREA_RESIZE = Object.freeze({
  vertical: 'resize-y min-h-textarea',
  none: 'resize-none',
});

const TEXTAREA_MAX_HEIGHTS = Object.freeze({
  none: '',
  composer: 'max-h-chat-input overflow-y-auto',
});

/**
 * Base TextArea component for multiline text editing across SpendWise.
 *
 * @param {object} props
 * @param {number} [props.rows=3] - Number of visible text lines
 * @param {string} [props.value] - Controlled value
 * @param {string} [props.defaultValue] - Uncontrolled default value
 * @param {function} [props.onChange] - Change handler
 * @param {string} [props.id] - HTML element ID
 * @param {string} [props.name] - Form field name
 * @param {string} [props.placeholder] - Placeholder text
 * @param {boolean} [props.disabled=false] - Whether textarea is disabled
 * @param {boolean} [props.readOnly=false] - Whether textarea is read-only
 * @param {boolean} [props.required=false] - Whether textarea is required
 * @param {boolean} [props.invalid=false] - Whether textarea is in invalid state
 * @param {'sm'|'md'} [props.size='md'] - Text size modifier
 * @param {'vertical'|'none'} [props.resize='vertical'] - Resize behavior
 * @param {'none'|'composer'} [props.maxHeight='none'] - Controlled max-height constraint
 */
const TextArea = forwardRef(function TextArea(
  {
    rows = 3,
    disabled = false,
    readOnly = false,
    required = false,
    invalid = false,
    size = 'md',
    resize = 'vertical',
    maxHeight = 'none',
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  const sizeClass = TEXTAREA_SIZES[size] || TEXTAREA_SIZES.md;
  const resizeClass = TEXTAREA_RESIZE[resize] || TEXTAREA_RESIZE.vertical;
  const maxHeightClass = TEXTAREA_MAX_HEIGHTS[maxHeight] || '';
  const stateClass = isInvalid
    ? 'border-error-accent focus:border-error-accent focus:shadow-focus-danger'
    : 'border-border focus:border-brand focus:shadow-focus';
  const classes = [BASE_TEXTAREA_CLASSES, sizeClass, resizeClass, maxHeightClass, stateClass]
    .filter(Boolean)
    .join(' ');

  return (
    <textarea
      ref={ref}
      rows={rows}
      className={classes}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-invalid={isInvalid ? 'true' : undefined}
      {...domProps}
    />
  );
});

export default TextArea;
