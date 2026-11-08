import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const HORIZONTAL_SPACING_CLASSES = {
  none: 'my-0',
  xs: 'my-1',
  sm: 'my-2',
  md: 'my-4',
  lg: 'my-6',
  xl: 'my-8',
};

const VERTICAL_SPACING_CLASSES = {
  none: 'mx-0',
  xs: 'mx-1',
  sm: 'mx-2',
  md: 'mx-4',
  lg: 'mx-6',
  xl: 'mx-8',
};

/**
 * Divider component for visual separation between content groups.
 *
 * @param {object} props
 * @param {'horizontal'|'vertical'} [props.orientation='horizontal'] - Orientation
 * @param {'none'|'xs'|'sm'|'md'|'lg'|'xl'} [props.spacing='none'] - Margin around divider
 * @param {string} [props.label] - Optional label rendered in the center of the divider
 */
export default function Divider({
  orientation = 'horizontal',
  spacing = 'none',
  label,
  ...rest
}) {
  const domProps = omitProps(rest);

  const isVertical = orientation === 'vertical';
  const spacingClass = isVertical
    ? VERTICAL_SPACING_CLASSES[spacing] || VERTICAL_SPACING_CLASSES.none
    : HORIZONTAL_SPACING_CLASSES[spacing] || HORIZONTAL_SPACING_CLASSES.none;

  let baseClass;
  if (label) {
    baseClass =
      "flex items-center w-full gap-2 text-xs uppercase tracking-wide text-content-muted before:content-[''] before:flex-1 before:border-t before:border-border after:content-[''] after:flex-1 after:border-t after:border-border";
  } else if (isVertical) {
    baseClass = 'border-0 border-l border-border h-full';
  } else {
    baseClass = 'border-0 border-t border-border w-full';
  }

  const classes = [baseClass, spacingClass].filter(Boolean).join(' ');

  return (
    <div role="separator" aria-orientation={orientation} className={classes} {...domProps}>
      {label && <span className="shrink-0">{label}</span>}
    </div>
  );
}
