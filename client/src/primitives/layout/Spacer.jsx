import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const VERTICAL_SIZE_CLASSES = {
  none: 'h-0',
  '2xs': 'h-0.5',
  xs: 'h-1',
  sm: 'h-2',
  md: 'h-4',
  lg: 'h-6',
  xl: 'h-8',
  '2xl': 'h-12',
};

const HORIZONTAL_SIZE_CLASSES = {
  none: 'w-0',
  '2xs': 'w-0.5',
  xs: 'w-1',
  sm: 'w-2',
  md: 'w-4',
  lg: 'w-6',
  xl: 'w-8',
  '2xl': 'w-12',
};

/**
 * Spacer component for intentional empty space between elements.
 *
 * @param {object} props
 * @param {'none'|'2xs'|'xs'|'sm'|'md'|'lg'|'xl'|'2xl'} [props.size='md'] - Spacing size
 * @param {'vertical'|'horizontal'} [props.axis='vertical'] - Layout direction
 * @param {boolean} [props.flex1=false] - Whether spacer expands flexibly
 */
export default function Spacer({
  size = 'md',
  axis = 'vertical',
  flex1 = false,
  ...rest
}) {
  const domProps = omitProps(rest);

  const isHorizontal = axis === 'horizontal';
  const sizeClass = isHorizontal
    ? HORIZONTAL_SIZE_CLASSES[size] || HORIZONTAL_SIZE_CLASSES.md
    : VERTICAL_SIZE_CLASSES[size] || VERTICAL_SIZE_CLASSES.md;
  const displayClass = isHorizontal ? 'inline-block' : 'block';
  const flexClass = flex1 ? 'flex-1' : '';

  const classes = [displayClass, 'shrink-0', sizeClass, flexClass].filter(Boolean).join(' ');

  return <span className={classes} aria-hidden="true" {...domProps} />;
}
