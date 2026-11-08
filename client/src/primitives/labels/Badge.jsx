import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const BADGE_VARIANTS = Object.freeze({
  default: 'bg-surface-muted text-content-secondary border-border',
  neutral: 'bg-surface-muted text-content-secondary border-border',
  subtle: 'bg-surface-subtle text-content-secondary border-border',
  info: 'bg-info-bg text-info-text border-info-border',
  success: 'bg-success-bg text-success-text border-success-border',
  warning: 'bg-warning-bg text-warning-text border-warning-border',
  danger: 'bg-danger-bg text-danger-text border-danger-border',
  error: 'bg-danger-bg text-danger-text border-danger-border',
  income: 'bg-income-bg text-income-text border-income-border',
  expense: 'bg-expense-bg text-expense-text border-expense-border',
});

const BADGE_SIZES = Object.freeze({
  sm: 'px-2 py-0.5 text-2xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
});

/**
 * Base Badge component.
 * Standardizes status, role, count, and health badges across the application.
 *
 * @param {object} props
 * @param {'default'|'neutral'|'subtle'|'info'|'success'|'warning'|'danger'|'error'|'income'|'expense'} [props.variant='default'] - Badge variant
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Badge size
 * @param {boolean} [props.pill=false] - Whether to apply pill border-radius
 * @param {boolean} [props.uppercase=false] - Whether to render uppercase tracking-wide text
 * @param {boolean} [props.mono=false] - Whether to use monospace font
 * @param {'span'|'div'} [props.as='span'] - HTML element to render
 * @param {React.ReactNode} props.children - Badge content
 */
const Badge = forwardRef(function Badge(
  {
    variant = 'default',
    size = 'md',
    pill = false,
    uppercase = false,
    mono = false,
    as: Component = 'span',
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const variantClass = BADGE_VARIANTS[variant] || BADGE_VARIANTS.default;
  const sizeClass = BADGE_SIZES[size] || BADGE_SIZES.md;
  const shapeClass = pill ? 'rounded-full' : 'rounded-sm';
  const uppercaseClass = uppercase ? 'uppercase tracking-wide' : '';
  const monoClass = mono ? 'font-mono' : '';

  const classes = [
    'inline-flex items-center justify-center gap-1 font-sans font-semibold leading-tight whitespace-nowrap border',
    variantClass,
    sizeClass,
    shapeClass,
    uppercaseClass,
    monoClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={classes} {...domProps}>
      {children}
    </Component>
  );
});

export default Badge;
