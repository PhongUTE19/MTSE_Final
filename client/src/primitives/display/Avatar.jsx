import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Controlled size mappings for Avatar.
 */
export const AVATAR_SIZES = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

/**
 * Controlled variant mappings for Avatar.
 */
export const AVATAR_VARIANTS = {
  default: 'bg-surface-muted text-content-secondary',
  dark: 'bg-content-primary text-content-inverse',
  brand: 'bg-brand text-content-inverse',
  sidebar: 'bg-sidebar-avatar text-sidebar-fg border border-sidebar-border font-bold text-xs',
};

/**
 * Avatar Base Component.
 * Standardizes circular avatar representations for users, assistants, and identity markers.
 * Follows strict Base Component conventions with zero external styling escape hatches.
 *
 * @param {object} props
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Avatar size
 * @param {'default'|'dark'|'brand'|'sidebar'} [props.variant='dark'] - Color and surface variant
 * @param {boolean} [props.decorative=true] - Whether to hide from assistive technology
 * @param {string} [props.label] - Accessible label when not decorative
 * @param {React.ReactNode} props.children - Avatar content, icon, or initials
 */
export const Avatar = forwardRef(function Avatar(
  {
    size = 'md',
    variant = 'dark',
    decorative = true,
    label,
    children,
    ...rest
  },
  ref
) {
  // Explicitly strip className and style to prevent arbitrary styling escape hatches
  const domProps = omitProps(rest);

  const sizeClass = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  const variantClass = AVATAR_VARIANTS[variant] || AVATAR_VARIANTS.dark;
  const classes = `inline-grid place-items-center rounded-full shrink-0 select-none [&>svg]:w-5 [&>svg]:h-5 ${sizeClass} ${variantClass}`;

  return (
    <span
      ref={ref}
      className={classes}
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      {...domProps}
    >
      {children}
    </span>
  );
});

export default Avatar;
