import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Controlled color mappings for ColorIndicator.
 */
export const COLOR_INDICATOR_COLORS = {
  emerald: 'bg-emerald-500',
  success: 'bg-emerald-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  error: 'bg-red-500',
  danger: 'bg-red-500',
  amber: 'bg-amber-500',
  warning: 'bg-amber-500',
  yellow: 'bg-amber-500',
  sky: 'bg-sky-500',
  blue: 'bg-sky-500',
  info: 'bg-sky-500',
  purple: 'bg-purple-500',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-400',
  gray: 'bg-slate-400',
};

/**
 * Controlled size mappings for ColorIndicator.
 */
export const COLOR_INDICATOR_SIZES = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

/**
 * ColorIndicator Base Component.
 * Renders a circular color marker for chart legends, status indicators, and list decorations.
 * Uses controlled props with zero external styling escape hatches.
 *
 * @param {object} props
 * @param {'emerald'|'success'|'green'|'red'|'error'|'danger'|'amber'|'warning'|'yellow'|'sky'|'blue'|'info'|'purple'|'indigo'|'slate'|'gray'} [props.color='slate'] - Indicator color
 * @param {'sm'|'md'|'lg'} [props.size='sm'] - Indicator size
 * @param {boolean} [props.decorative=true] - Whether the indicator is hidden from assistive technology
 * @param {string} [props.label] - Accessible label when not decorative
 */
export const ColorIndicator = forwardRef(function ColorIndicator(
  {
    color = 'slate',
    size = 'sm',
    decorative = true,
    label,
    ...rest
  },
  ref
) {
  // Explicitly strip className and style to prevent styling escape hatches
  const domProps = omitProps(rest);

  const colorClass = COLOR_INDICATOR_COLORS[color] || COLOR_INDICATOR_COLORS.slate;
  const sizeClass = COLOR_INDICATOR_SIZES[size] || COLOR_INDICATOR_SIZES.sm;
  const classes = `inline-block rounded-full flex-shrink-0 ${sizeClass} ${colorClass}`;

  return (
    <span
      ref={ref}
      className={classes}
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      {...domProps}
    />
  );
});

export const Dot = ColorIndicator;

export default ColorIndicator;
