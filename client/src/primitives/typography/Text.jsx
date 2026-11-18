import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';
import { useOverflowFade } from '../../shared/hooks/useOverflowFade.js';

const VARIANT_CONFIG = {
  body: { size: 'text-base', color: 'text-content-primary', extra: 'leading-normal' },
  'body-sm': { size: 'text-sm', color: 'text-content-primary', extra: 'leading-normal' },
  secondary: { size: 'text-sm', color: 'text-content-secondary', extra: 'leading-normal' },
  caption: { size: 'text-xs', color: 'text-content-muted', extra: 'leading-normal' },
  kicker: {
    size: 'text-xs',
    weight: 'font-bold',
    color: 'text-content-muted',
    extra: 'uppercase tracking-wide mb-1',
  },
  eyebrow: {
    size: 'text-xs',
    weight: 'font-bold',
    color: 'text-content-muted',
    extra: 'uppercase tracking-wide mb-1',
  },
  'sidebar-eyebrow': {
    size: 'text-2xs',
    weight: 'font-bold',
    color: 'text-sidebar-muted',
    extra: 'uppercase tracking-wider',
  },
  heading: {
    size: 'text-lg',
    weight: 'font-semibold',
    color: 'text-content-primary',
    extra: 'leading-tight',
  },
  title: {
    size: 'text-xl',
    weight: 'font-bold',
    color: 'text-content-primary',
    extra: 'leading-tight',
  },
  display: {
    size: 'text-display',
    weight: 'font-bold',
    color: 'text-content-primary',
    extra: 'leading-none tracking-tighter',
  },
  h1: {
    size: 'text-2xl',
    weight: 'font-bold',
    color: 'text-content-primary',
    extra: 'leading-tight tracking-tight',
  },
  h2: {
    size: 'text-xl',
    weight: 'font-bold',
    color: 'text-content-primary',
    extra: 'leading-tight',
  },
  h3: {
    size: 'text-lg',
    weight: 'font-semibold',
    color: 'text-content-primary',
    extra: 'leading-snug',
  },
  label: {
    size: 'text-xs',
    weight: 'font-semibold',
    color: 'text-content-secondary',
    extra: 'uppercase tracking-wide',
  },
  overline: {
    size: 'text-2xs',
    weight: 'font-bold',
    color: 'text-content-muted',
    extra: 'uppercase tracking-wider',
  },
  code: { size: 'text-xs', extra: 'font-mono leading-normal', mono: true },
  mono: { size: 'text-xs', extra: 'font-mono leading-normal', mono: true },
  stat: {
    size: 'text-xl',
    weight: 'font-bold',
    color: 'text-content-primary',
    extra: 'leading-tight tabular-nums',
  },
  error: { size: 'text-xs', weight: 'font-medium', color: 'text-error-text' },
  helper: { size: 'text-xs', color: 'text-content-muted' },
};

const SIZE_CLASSES = {
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  display: 'text-display',
};

const WEIGHT_CLASSES = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const ALIGN_CLASSES = {
  start: 'text-left',
  left: 'text-left',
  center: 'text-center',
  end: 'text-right',
  right: 'text-right',
};

const COLOR_CLASSES = {
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
  highlight: 'text-info-accent',
  income: 'text-income',
  expense: 'text-expense',
  sidebar: 'text-sidebar-fg',
  'sidebar-muted': 'text-sidebar-muted',
  inherit: 'text-inherit',
};

const CLAMP_CLASSES = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
};

/**
 * Text typography Base Component.
 * Enforces design system font scales, weights, and semantic variants
 * with strictly controlled props and zero external styling escape hatches.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='p'] - HTML tag to render
 * @param {'body'|'body-sm'|'secondary'|'caption'|'kicker'|'eyebrow'|'sidebar-eyebrow'|'heading'|'title'|'display'|'h1'|'h2'|'h3'|'label'|'overline'|'code'|'mono'|'stat'|'error'|'helper'} [props.variant='body'] - Semantic text variant
 * @param {'2xs'|'xs'|'sm'|'base'|'lg'|'xl'|'2xl'|'display'} [props.size] - Explicit font size override
 * @param {'normal'|'medium'|'semibold'|'bold'} [props.weight] - Explicit font weight override
 * @param {'start'|'left'|'center'|'end'|'right'} [props.align] - Text alignment
 * @param {'primary'|'secondary'|'muted'|'inverse'|'brand'|'success'|'danger'|'error'|'warning'|'info'|'highlight'|'income'|'expense'|'sidebar'|'sidebar-muted'|'inherit'} [props.color] - Semantic color override
 * @param {boolean} [props.truncate=false] - Whether to truncate with an ellipsis
 * @param {1|2|3} [props.clamp] - Number of lines to clamp multiline text
 * @param {boolean} [props.preserveWhitespace=false] - Preserve whitespace and newlines
 * @param {boolean} [props.nowrap=false] - Prevent line wrapping
 * @param {boolean} [props.italic=false] - Render italic text
 * @param {boolean} [props.tabularNums=false] - Use tabular numerals
 * @param {React.ReactNode} props.children - Text content
 */
const Text = forwardRef(function Text(
  {
    as: Component = 'p',
    variant = 'body',
    size,
    weight,
    align,
    color,
    truncate = false,
    clamp,
    preserveWhitespace = false,
    nowrap = false,
    italic = false,
    tabularNums = false,
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);
  const textContent = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  const { ref: overflowRef, isOverflowing } = useOverflowFade(ref, Boolean(truncate), textContent);

  const variantDef = VARIANT_CONFIG[variant] || VARIANT_CONFIG.body;
  const resolvedSize = size ? SIZE_CLASSES[size] : variantDef.size;
  const resolvedWeight = weight ? WEIGHT_CLASSES[weight] : variantDef.weight;
  const resolvedColor = color ? COLOR_CLASSES[color] : variantDef.color;
  const resolvedFont = variantDef.mono ? null : 'font-sans';
  const truncateClass = truncate
    ? (isOverflowing ? 'min-w-0 text-overflow-fade-active' : 'min-w-0 text-overflow-fade')
    : null;

  const classes = [
    'm-0',
    resolvedFont,
    resolvedSize,
    resolvedWeight,
    resolvedColor,
    variantDef.extra,
    align ? ALIGN_CLASSES[align] : null,
    truncateClass,
    clamp ? CLAMP_CLASSES[clamp] : null,
    preserveWhitespace ? 'whitespace-pre-wrap' : null,
    nowrap ? 'whitespace-nowrap' : null,
    italic ? 'italic' : null,
    tabularNums ? 'tabular-nums' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedTitle = domProps.title || (truncate && isOverflowing ? textContent : undefined);

  return (
    <Component ref={truncate ? overflowRef : ref} className={classes} {...domProps} title={resolvedTitle}>
      {children}
    </Component>
  );
});

export default Text;
