import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const BASE_SELECT_CLASSES =
  'border rounded-md font-sans text-content-primary bg-surface overflow-hidden whitespace-nowrap text-ellipsis transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none disabled:bg-surface-muted disabled:text-content-muted disabled:cursor-not-allowed';

const SELECT_SIZES = Object.freeze({
  sm: 'min-h-control-sm px-2.5 py-1 text-xs',
  md: 'min-h-control px-3 py-2 text-base',
  lg: 'min-h-nav-item px-3.5 py-2.5 text-base',
});

/**
 * Base Select component for dropdown controls across SpendWise.
 * Supports options via an `options` prop array or standard React `children` (<option> tags).
 *
 * @param {object} props
 * @param {Array<{value: string|number, label: string, disabled?: boolean}|string>} [props.options] - Option list
 * @param {string|number} [props.value] - Controlled value
 * @param {string|number} [props.defaultValue] - Uncontrolled default value
 * @param {function} [props.onChange] - Change handler
 * @param {string} [props.id] - HTML element ID
 * @param {string} [props.name] - Form field name
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Sizing modifier
 * @param {boolean} [props.disabled=false] - Whether select is disabled
 * @param {boolean} [props.required=false] - Whether select is required
 * @param {boolean} [props.invalid=false] - Whether select is in invalid state
 * @param {React.ReactNode} [props.children] - Child option elements
 */
const Select = forwardRef(function Select(
  {
    options,
    size = 'md',
    fullWidth = true,
    disabled = false,
    required = false,
    invalid = false,
    'aria-invalid': ariaInvalid,
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  const widthClass = fullWidth ? 'w-full' : 'w-auto shrink-0';
  const sizeClass = SELECT_SIZES[size] || SELECT_SIZES.md;
  const stateClass = isInvalid
    ? 'border-error-accent focus:border-error-accent focus:shadow-focus-danger'
    : 'border-border focus:border-brand focus:shadow-focus';
  const classes = [BASE_SELECT_CLASSES, widthClass, sizeClass, stateClass].filter(Boolean).join(' ');

  return (
    <select
      ref={ref}
      className={classes}
      disabled={disabled}
      required={required}
      aria-invalid={isInvalid ? 'true' : undefined}
      {...domProps}
    >
      {options
        ? options.map((opt) => {
            const val = typeof opt === 'object' && opt !== null ? opt.value : opt;
            const label = typeof opt === 'object' && opt !== null ? opt.label : opt;
            const optDisabled = typeof opt === 'object' && opt !== null ? Boolean(opt.disabled) : false;
            return (
              <option key={val} value={val} disabled={optDisabled}>
                {label}
              </option>
            );
          })
        : children}
    </select>
  );
});

export default Select;
