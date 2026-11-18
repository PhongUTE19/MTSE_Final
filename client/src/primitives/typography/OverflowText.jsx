import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';
import { useOverflowFade } from '../../shared/hooks/useOverflowFade.js';

const ALIGN_CLASSES = {
  start: 'text-left',
  left: 'text-left',
  center: 'text-center',
  end: 'text-right',
  right: 'text-right',
};

const SIZE_CLASSES = {
  '2xs': 'text-2xs',
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
};

const WEIGHT_CLASSES = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const COLOR_CLASSES = {
  primary: 'text-content-primary',
  secondary: 'text-content-secondary',
  muted: 'text-content-muted',
  inverse: 'text-content-inverse',
  sidebar: 'text-sidebar-fg',
  'sidebar-muted': 'text-sidebar-muted',
  inherit: '',
};

/**
 * Single-line clipping text primitive that applies a subtle right-edge
 * alpha-mask fade only when the rendered content overflows its container.
 */
const OverflowText = forwardRef(function OverflowText(
  {
    as: Component = 'span',
    align,
    size,
    weight,
    color,
    fullWidth = false,
    title,
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);
  const textContent = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  const { ref: overflowRef, isOverflowing } = useOverflowFade(ref, true, textContent);

  const classes = [
    'block min-w-0',
    fullWidth ? 'w-full flex-1' : null,
    isOverflowing ? 'text-overflow-fade-active' : 'text-overflow-fade',
    align ? ALIGN_CLASSES[align] : null,
    size ? SIZE_CLASSES[size] : null,
    weight ? WEIGHT_CLASSES[weight] : null,
    color ? COLOR_CLASSES[color] : null,
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedTitle = title || (isOverflowing ? textContent : undefined);

  return (
    <Component ref={overflowRef} className={classes} title={resolvedTitle} {...domProps}>
      {children}
    </Component>
  );
});

export default OverflowText;
