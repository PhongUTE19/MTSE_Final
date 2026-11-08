import React, { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { omitProps } from '../../shared/utils/domProps.js';

export const LINK_VARIANTS = {
  primary: 'text-content-primary font-semibold underline underline-offset-4 hover:text-content-secondary',
  secondary: 'text-content-secondary underline underline-offset-2 hover:text-content-primary',
  muted: 'text-content-muted hover:text-content-primary',
};

export const LINK_SIZES = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
};

/**
 * Base Link Component.
 * Controlled navigation element wrapping React Router Link or native anchor.
 * Strictly strips arbitrary external className and style overrides.
 *
 * @param {object} props
 * @param {string} [props.to] - React Router destination path
 * @param {string} [props.href] - Anchor href for external/native links
 * @param {'primary'|'secondary'|'muted'} [props.variant='primary'] - Visual link variant
 * @param {'xs'|'sm'|'base'} [props.size='sm'] - Font size
 * @param {React.ReactNode} props.children - Link content
 */
export const Link = forwardRef(function Link(
  {
    to,
    href,
    variant = 'primary',
    size = 'sm',
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const variantClass = LINK_VARIANTS[variant] || LINK_VARIANTS.primary;
  const sizeClass = LINK_SIZES[size] || LINK_SIZES.sm;
  const combinedClass = `inline-flex items-center transition-colors focus-visible:outline-none focus-visible:shadow-focus focus-visible:rounded-sm ${variantClass} ${sizeClass}`;

  if (to) {
    return (
      <RouterLink ref={ref} to={to} className={combinedClass} {...domProps}>
        {children}
      </RouterLink>
    );
  }

  return (
    <a ref={ref} href={href} className={combinedClass} {...domProps}>
      {children}
    </a>
  );
});

export default Link;
