import React, { forwardRef } from 'react';
import Spinner from '../feedback/Spinner.jsx';

const BASE_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-1.5 font-sans font-semibold leading-tight cursor-pointer select-none whitespace-nowrap border border-transparent transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:enabled:translate-y-0 active:enabled:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60 disabled:cursor-not-allowed';

const BUTTON_VARIANTS = Object.freeze({
  primary:
    'bg-brand text-content-inverse border-brand hover:enabled:bg-brand-hover hover:enabled:-translate-y-px hover:enabled:shadow-button-hover',
  secondary:
    'bg-surface text-content-primary border-border hover:enabled:bg-surface-subtle hover:enabled:border-border-hover',
  ghost:
    'bg-transparent text-content-secondary border-transparent hover:enabled:bg-surface-muted hover:enabled:text-content-primary',
  danger:
    'bg-danger-bg text-danger-text border-danger-border hover:enabled:bg-danger-hover focus-visible:shadow-focus-danger',
  fab:
    'bg-brand text-content-inverse border-brand shadow-fab pointer-events-auto hover:enabled:bg-brand-hover hover:enabled:-translate-y-px hover:enabled:shadow-button-hover',
  chip:
    'bg-surface-muted text-content-secondary border-border text-xs hover:enabled:bg-surface-hover',
  outline:
    'bg-transparent text-content-primary border-border hover:enabled:bg-surface-hover hover:enabled:border-border-hover',
  sidebar:
    'bg-transparent text-sidebar-muted border-transparent justify-between text-left hover:enabled:bg-sidebar-hover hover:enabled:text-sidebar-fg hover:enabled:border-sidebar-border hover:enabled:translate-x-px focus-visible:shadow-focus-inverse',
  'sidebar-active':
    'bg-sidebar-active text-sidebar-fg border-sidebar-border justify-between text-left hover:enabled:bg-sidebar-hover hover:enabled:text-sidebar-fg hover:enabled:border-sidebar-border hover:enabled:translate-x-px focus-visible:shadow-focus-inverse',
  'sidebar-secondary':
    'bg-sidebar-hover text-sidebar-fg border-sidebar-border hover:enabled:bg-sidebar-active focus-visible:shadow-focus-inverse',
  'table-header':
    'bg-transparent text-content-muted border-transparent uppercase tracking-wide hover:enabled:text-content-primary',
});

const BUTTON_RADII = Object.freeze({
  primary: 'rounded-full',
  secondary: 'rounded-full',
  danger: 'rounded-full',
  fab: 'rounded-full',
  ghost: 'rounded-md',
  chip: 'rounded-xl',
  outline: 'rounded-full',
  sidebar: 'rounded-lg',
  'sidebar-active': 'rounded-lg',
  'sidebar-secondary': 'rounded-full',
  'table-header': 'rounded-sm',
});

const BUTTON_SIZES = Object.freeze({
  sm: 'min-h-control-sm px-2.5 py-1 text-xs',
  md: 'min-h-control px-4 py-2 text-sm',
  lg: 'min-h-nav-item px-5 py-2.5 text-base',
});

const ICON_ONLY_SIZES = Object.freeze({
  sm: 'w-7 h-7 min-h-control-sm p-0 text-xs',
  md: 'w-9 h-9 min-h-control p-0 text-sm',
  lg: 'w-11 h-11 min-h-nav-item p-0 text-base',
});

/**
 * Base Button component for SpendWise.
 * Standardizes button styling, variants, sizes, and accessibility across the application.
 * Arbitrary className and style overrides are strictly stripped to enforce Design System control.
 *
 * @param {object} props
 * @param {'primary'|'secondary'|'danger'|'chip'|'ghost'|'outline'|'fab'|'sidebar'|'sidebar-active'|'sidebar-secondary'} [props.variant='primary'] - Visual variant
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Button size
 * @param {'button'|'submit'|'reset'} [props.type='button'] - Semantic button type
 * @param {boolean} [props.disabled=false] - Whether button is disabled
 * @param {boolean} [props.loading=false] - Whether button is in loading state
 * @param {boolean} [props.iconOnly=false] - Icon-only square button flag
 * @param {boolean} [props.fullWidth=false] - Whether button spans full container width
 * @param {React.ReactNode} [props.icon] - Leading icon element
 * @param {React.ReactNode} props.children - Button label or contents
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    iconOnly = false,
    fullWidth = false,
    icon,
    children,
    ...rest
  },
  ref
) {
  const {
    className: _strippedClassName,
    style: _strippedStyle,
    ...domProps
  } = rest;
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  const radiusClass = iconOnly
    ? variant === 'fab'
      ? 'rounded-full'
      : 'rounded-md'
    : BUTTON_RADII[variant] || 'rounded-full';

  let sizeClass;
  if (iconOnly) {
    sizeClass = ICON_ONLY_SIZES[size] || ICON_ONLY_SIZES.md;
  } else if (variant === 'fab') {
    sizeClass = 'w-fab h-fab p-0 text-xl';
  } else if (variant === 'table-header') {
    sizeClass = 'p-0 min-h-0 text-xs leading-tight';
  } else {
    sizeClass = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  }

  const widthClass = fullWidth ? 'w-full' : '';

  const classes = [BASE_BUTTON_CLASSES, radiusClass, variantClass, sizeClass, widthClass]
    .filter(Boolean)
    .join(' ');

  const spinnerVariant =
    variant === 'primary' || variant === 'fab' || variant === 'sidebar-active' || variant === 'sidebar-secondary'
      ? 'inverse'
      : 'default';

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      data-loading={loading ? 'true' : undefined}
      {...domProps}
    >
      {loading ? (
        <Spinner size="xs" variant={spinnerVariant} ariaHidden />
      ) : (
        icon && (
          <span className="inline-flex items-center justify-center shrink-0 [&>svg]:block [&>svg]:shrink-0">
            {icon}
          </span>
        )
      )}
      {!(iconOnly && loading) && children}
    </button>
  );
});

export default Button;
