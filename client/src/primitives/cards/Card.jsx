import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

export const CARD_VARIANTS = {
  default: 'bg-surface border-border shadow-card',
  subtle: 'bg-surface-subtle border-border',
  muted: 'bg-surface-muted border-border',
  outlined: 'bg-surface border-border',
  flat: 'bg-surface-subtle border-transparent',
  raised: 'bg-surface border-border shadow-card',
  glass: 'bg-surface-glass backdrop-blur-glass border-border-glass overflow-hidden shadow-card',
  interactive:
    'bg-surface border-border shadow-card cursor-pointer select-none hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:shadow-focus',
  danger: 'bg-danger-bg border-danger-border text-danger-text',
  warning: 'bg-warning-bg border-warning-border text-warning-text',
  success: 'bg-success-bg border-success-border text-success-text',
  info: 'bg-info-bg border-info-border text-info-text',
};

export const CARD_PADDINGS = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5 max-mobile:p-3.5',
  lg: 'p-6 max-mobile:p-4',
  xl: 'p-8 max-tablet:p-5 max-mobile:p-4',
};

export const CARD_MAX_WIDTHS = {
  none: '',
  sm: 'w-full max-w-sm',
  md: 'w-full max-w-md',
  lg: 'w-full max-w-lg',
  xl: 'w-full max-w-xl',
  full: 'w-full',
};

/**
 * Base Card Component.
 * Business-agnostic surface container that owns its visual presentation
 * (background, border, radius, shadow, padding, max-width) via controlled Design System props.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='div'] - Element or component tag
 * @param {'default'|'subtle'|'muted'|'outlined'|'flat'|'raised'|'glass'|'interactive'|'danger'|'warning'|'success'|'info'} [props.variant='default'] - Surface variant
 * @param {'none'|'sm'|'md'|'lg'|'xl'} [props.padding='md'] - Inner padding scale
 * @param {'none'|'sm'|'md'|'lg'|'xl'|'full'} [props.maxWidth] - Optional max-width constraint
 * @param {boolean} [props.hoverable=false] - Apply hover elevation effect
 * @param {boolean} [props.interactive=false] - Apply interactive cursor, hover, and focus ring
 * @param {boolean} [props.selected=false] - Apply selected brand highlight ring
 * @param {React.ReactNode} props.children - Card contents
 */
export const Card = forwardRef(function Card(
  {
    as: Component = 'div',
    variant = 'default',
    padding = 'md',
    maxWidth,
    hoverable = false,
    interactive = false,
    selected = false,
    children,
    ...rest
  },
  ref
) {
  // Strip arbitrary className and style overrides per Strict Component Styling Policy
  const domProps = omitProps(rest);

  const variantClass = CARD_VARIANTS[variant] || CARD_VARIANTS.default;
  const paddingClass = CARD_PADDINGS[padding] || CARD_PADDINGS.md;
  const maxWidthClass = maxWidth ? (CARD_MAX_WIDTHS[maxWidth] || '') : '';
  const hoverableClass = hoverable ? 'hover:-translate-y-0.5 hover:shadow-card-hover' : '';
  const interactiveClass = interactive
    ? 'cursor-pointer select-none hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:shadow-focus'
    : '';
  const selectedClass = selected ? 'border-brand ring-2 ring-brand/15' : '';

  const combinedClass = [
    'rounded-xl border transition-[background-color,border-color,box-shadow,transform] duration-150',
    variantClass,
    paddingClass,
    maxWidthClass,
    hoverableClass,
    interactiveClass,
    selectedClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={combinedClass} {...domProps}>
      {children}
    </Component>
  );
});

export default Card;
