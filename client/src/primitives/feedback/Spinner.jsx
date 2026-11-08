import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const SPINNER_SIZES = Object.freeze({
  xs: 'w-3 h-3 border-2',
  sm: 'w-3.5 h-3.5 border-2',
  md: 'w-5 h-5 border-2.5',
  lg: 'w-7 h-7 border-3',
});

const SPINNER_VARIANTS = Object.freeze({
  default: 'border-border border-t-content-secondary',
  primary: 'border-border border-t-brand',
  inverse: 'border-white/30 border-t-content-inverse',
});

/**
 * Base Spinner component.
 * Standardizes loading indicators across buttons, cards, and asynchronous views.
 *
 * @param {object} props
 * @param {'xs'|'sm'|'md'|'lg'} [props.size='md'] - Spinner size
 * @param {'default'|'primary'|'inverse'} [props.variant='primary'] - Visual color variant
 * @param {string} [props.label='Loading...'] - Accessible label when not hidden
 * @param {boolean} [props.ariaHidden=true] - Whether spinner is hidden from screen readers
 */
const Spinner = forwardRef(function Spinner(
  {
    size = 'md',
    variant = 'primary',
    label = 'Loading...',
    ariaHidden = true,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const sizeClass = SPINNER_SIZES[size] || SPINNER_SIZES.md;
  const variantClass = SPINNER_VARIANTS[variant] || SPINNER_VARIANTS.primary;
  const classes = ['inline-block rounded-full border-solid animate-spin shrink-0', sizeClass, variantClass]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      ref={ref}
      className={classes}
      role={ariaHidden ? undefined : 'status'}
      aria-hidden={ariaHidden ? 'true' : undefined}
      aria-label={!ariaHidden ? label : undefined}
      {...domProps}
    />
  );
});

export default Spinner;
