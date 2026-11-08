import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Controlled visual variants for ChartBar.
 */
export const CHART_BAR_VARIANTS = Object.freeze({
  primary: 'bg-brand',
  brand: 'bg-brand',
  income: 'bg-income-accent',
  expense: 'bg-expense-accent',
  success: 'bg-success-accent',
  warning: 'bg-warning-accent',
  danger: 'bg-danger-accent',
  info: 'bg-info-accent',
  neutral: 'bg-content-muted',
  muted: 'bg-content-muted',
});

/**
 * Controlled track background styles.
 */
export const CHART_BAR_TRACKS = Object.freeze({
  default: 'bg-surface-muted',
  subtle: 'bg-surface-subtle',
  muted: 'bg-surface-muted',
});

/**
 * Controlled thickness dimensions by orientation.
 */
export const CHART_BAR_SIZES = Object.freeze({
  horizontal: {
    xs: 'h-1.5',
    sm: 'h-2',
    md: 'h-2.5',
    lg: 'h-3.5',
  },
  vertical: {
    xs: 'w-1.5',
    sm: 'w-2',
    md: 'w-2.5',
    lg: 'w-3.5',
  },
});

/**
 * Minimum visible fill percentage for non-zero values to ensure visual clarity.
 */
const MIN_FILL_PERCENTAGE = 2;
const MAX_FILL_PERCENTAGE = 100;

/**
 * Helper to compute clamped percentage from value & maxValue or percentage prop.
 */
function computePercentage(percentage, value, maxValue, minPercentage) {
  let rawPercent = 0;

  if (typeof percentage === 'number' && Number.isFinite(percentage)) {
    rawPercent = percentage;
  } else if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    typeof maxValue === 'number' &&
    Number.isFinite(maxValue) &&
    maxValue > 0
  ) {
    rawPercent = (value / maxValue) * 100;
  }

  if (rawPercent <= 0) {
    return 0;
  }

  return Math.min(Math.max(rawPercent, minPercentage), MAX_FILL_PERCENTAGE);
}

/**
 * Base Component for rendering accessible, controlled chart bars without SVGs or arbitrary styling escape hatches.
 *
 * @param {object} props
 * @param {number} [props.value] - Numeric progress value
 * @param {number} [props.maxValue=100] - Maximum value for ratio calculation
 * @param {number} [props.percentage] - Direct percentage (0 - 100)
 * @param {'primary'|'brand'|'income'|'expense'|'info'|'success'|'warning'|'danger'|'neutral'|'muted'} [props.variant='primary'] - Visual color variant
 * @param {string} [props.fillColor] - Optional raw fill color hex/token if custom palette is passed
 * @param {'horizontal'|'vertical'} [props.orientation='horizontal'] - Layout orientation
 * @param {'xs'|'sm'|'md'|'lg'} [props.size='md'] - Thickness dimension
 * @param {'default'|'subtle'|'muted'} [props.track='default'] - Track background appearance
 * @param {number} [props.minVisiblePercentage=2] - Minimum non-zero visible fill percentage
 * @param {string} [props.label] - Accessible label describing the bar
 * @param {boolean} [props.ariaHidden=true] - Whether to hide from assistive technologies (default true when purely decorative)
 */
export const ChartBar = forwardRef(function ChartBar(
  {
    value,
    maxValue = 100,
    percentage,
    variant = 'primary',
    fillColor,
    orientation = 'horizontal',
    size = 'md',
    track = 'default',
    minVisiblePercentage = MIN_FILL_PERCENTAGE,
    label,
    ariaHidden = true,
    ...rest
  },
  ref
) {
  // Strip arbitrary styling escape hatches per Strict Component Styling Policy
  const domProps = omitProps(rest);

  const resolvedOrientation = orientation === 'vertical' ? 'vertical' : 'horizontal';
  const orientationClass =
    resolvedOrientation === 'vertical' ? 'h-full flex items-end' : 'w-full flex-1';
  const sizeClass =
    CHART_BAR_SIZES[resolvedOrientation][size] || CHART_BAR_SIZES[resolvedOrientation].md;
  const trackClass = CHART_BAR_TRACKS[track] || CHART_BAR_TRACKS.default;

  const barClasses = ['rounded-full overflow-hidden', orientationClass, sizeClass, trackClass]
    .filter(Boolean)
    .join(' ');

  const variantFillClass = CHART_BAR_VARIANTS[variant] || CHART_BAR_VARIANTS.primary;
  const fillDimensionClass = resolvedOrientation === 'vertical' ? 'w-full' : 'h-full';
  const fillClasses = [
    'rounded-full transition-dimensions duration-300 ease-out min-w-0 min-h-0',
    fillDimensionClass,
    !fillColor ? variantFillClass : '',
  ]
    .filter(Boolean)
    .join(' ');

  const computedPercent = computePercentage(percentage, value, maxValue, minVisiblePercentage);

  const fillStyle = {};
  if (resolvedOrientation === 'horizontal') {
    fillStyle.width = `${computedPercent}%`;
  } else {
    fillStyle.height = `${computedPercent}%`;
  }

  if (fillColor) {
    fillStyle.backgroundColor = fillColor;
  }

  const isAccessible = !ariaHidden && label;

  return (
    <div
      ref={ref}
      className={barClasses}
      role={isAccessible ? 'progressbar' : undefined}
      aria-hidden={ariaHidden ? 'true' : undefined}
      aria-label={isAccessible ? label : undefined}
      aria-valuenow={isAccessible ? (typeof value === 'number' ? value : computedPercent) : undefined}
      aria-valuemin={isAccessible ? 0 : undefined}
      aria-valuemax={isAccessible ? maxValue : undefined}
      {...domProps}
    >
      <div className={fillClasses} style={fillStyle} />
    </div>
  );
});

export default ChartBar;
