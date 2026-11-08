import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

export const LOGO_SIZES = {
  sm: { box: 'w-6 h-6 text-xs', text: 'text-sm font-medium' },
  md: { box: 'w-8 h-8 text-sm', text: 'text-lg font-semibold' },
  lg: { box: 'w-10 h-10 text-base', text: 'text-xl font-bold' },
};

export const LOGO_VARIANTS = {
  default: 'bg-surface text-content-primary border border-border shadow-sm',
  dark: 'bg-content-primary text-content-inverse',
  brand: 'bg-info-accent text-content-inverse',
  inverted: 'bg-surface text-brand font-bold',
};

/**
 * Reusable Base Component for brand logo presentation.
 * Encapsulates symbol and brand text display with controlled sizes and variants.
 * Strictly strips arbitrary external className and style overrides.
 */
export default function Logo({
  size = 'md',
  variant = 'default',
  symbol = 'S',
  showText = false,
  text = 'SpendWise',
  label = 'SpendWise',
  decorative = true,
  ...rest
}) {
  const domProps = omitProps(rest);
  const sizeConfig = LOGO_SIZES[size] || LOGO_SIZES.md;
  const variantClass = LOGO_VARIANTS[variant] || LOGO_VARIANTS.default;

  const symbolElement = (
    <span
      className={`inline-grid place-items-center rounded-md font-bold select-none ${sizeConfig.box} ${variantClass}`}
      aria-hidden={decorative && !showText ? 'true' : undefined}
      role={!decorative ? 'img' : undefined}
      aria-label={!decorative ? label : undefined}
    >
      {symbol}
    </span>
  );

  if (!showText) {
    return symbolElement;
  }

  return (
    <div
      className="inline-flex items-center gap-2"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      {...domProps}
    >
      {symbolElement}
      <span className={`tracking-tight ${sizeConfig.text}`}>
        {text}
      </span>
    </div>
  );
}
