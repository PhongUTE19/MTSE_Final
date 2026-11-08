import React from 'react';
import { DeleteIcon, EditIcon, GoogleMark, WalletSparklesIcon } from './Icons.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

export const ICON_NAMES = {
  delete: DeleteIcon,
  edit: EditIcon,
  google: GoogleMark,
  'wallet-sparkles': WalletSparklesIcon,
};

export const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

export const ICON_COLORS = {
  primary: 'text-content-primary',
  secondary: 'text-content-secondary',
  muted: 'text-content-muted',
  inverse: 'text-content-inverse',
  brand: 'text-brand',
  success: 'text-success-text',
  danger: 'text-danger-text',
  error: 'text-error-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
};

/**
 * Base Icon Component.
 * Standardizes vector icons with controlled size and semantic color props.
 * Strictly strips arbitrary external className and style overrides.
 */
export default function Icon({
  name,
  size = 'md',
  color,
  children,
  ariaLabel,
  decorative = true,
  ...rest
}) {
  const domProps = omitProps(rest);

  const IconComponent = ICON_NAMES[name];
  const sizeClass = ICON_SIZES[size] || ICON_SIZES.md;
  const colorClass = color ? ICON_COLORS[color] || '' : '';
  const combinedClass = `${sizeClass} ${colorClass}`.trim();

  if (IconComponent) {
    return (
      <IconComponent
        size={size}
        color={color}
        aria-hidden={decorative ? 'true' : undefined}
        aria-label={!decorative ? ariaLabel : undefined}
        role={!decorative ? 'img' : undefined}
        {...domProps}
      />
    );
  }

  if (children) {
    return (
      <span
        className={`inline-flex items-center justify-center ${combinedClass}`}
        aria-hidden={decorative ? 'true' : undefined}
        aria-label={!decorative ? ariaLabel : undefined}
        role={!decorative ? 'img' : undefined}
        {...domProps}
      >
        {children}
      </span>
    );
  }

  return null;
}
