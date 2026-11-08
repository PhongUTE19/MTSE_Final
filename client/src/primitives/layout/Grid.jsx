import React, { forwardRef } from 'react';

const GAP_CLASSES = {
  none: 'gap-0',
  '2xs': 'gap-0.5',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-12',
};

const COLS_CLASSES = {
  1: 'grid-cols-1',
  2: 'grid-cols-2 max-tablet:grid-cols-1',
  3: 'grid-cols-3 max-desktop:grid-cols-2 max-tablet:grid-cols-1',
  4: 'grid-cols-4 max-desktop:grid-cols-2 max-tablet:grid-cols-1',
  auto: 'grid-cols-[repeat(auto-fit,minmax(180px,1fr))]',
  'auto-fit': 'grid-cols-[repeat(auto-fit,minmax(180px,1fr))]',
  'auto-fill': 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]',
  split: 'grid-cols-[1fr_1.3fr] max-desktop:grid-cols-1',
  '2-sm': 'grid-cols-2 max-xs:grid-cols-1',
};

const ALIGN_CLASSES = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const JUSTIFY_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  stretch: 'justify-stretch',
};

/**
 * Grid component for multi-column and multi-row layouts.
 * Arranges children with consistent gap spacing and controlled columns.
 * Arbitrary className and style overrides are strictly stripped to enforce Design System control.
 *
 * @param {object} props
 * @param {'none'|'2xs'|'xs'|'sm'|'md'|'lg'|'xl'|'2xl'} [props.gap='md'] - Grid gap
 * @param {1|2|3|4|'auto'|'auto-fit'|'auto-fill'|'split'|'2-sm'} [props.columns=1] - Number of columns or dynamic fit
 * @param {'start'|'center'|'end'|'stretch'} [props.align] - Cross-axis alignment
 * @param {'start'|'center'|'end'|'between'|'around'|'stretch'} [props.justify] - Main-axis justification
 * @param {boolean} [props.fullWidth=false] - Whether grid takes full 100% width
 * @param {React.ElementType} [props.as='div'] - Element tag name
 * @param {React.ReactNode} props.children - Child elements
 */
const Grid = forwardRef(function Grid(
  {
    gap = 'md',
    columns = 1,
    align,
    justify,
    fullWidth = false,
    as: Component = 'div',
    children,
    ...rest
  },
  ref
) {
  const {
    className: _strippedClassName,
    style: _strippedStyle,
    ...domProps
  } = rest;
  const gapClass = gap ? GAP_CLASSES[gap] || '' : '';
  const colsClass = columns ? COLS_CLASSES[columns] || '' : '';
  const alignClass = align ? ALIGN_CLASSES[align] || '' : '';
  const justifyClass = justify ? JUSTIFY_CLASSES[justify] || '' : '';
  const widthClass = fullWidth ? 'w-full' : '';

  const classes = ['grid', colsClass, gapClass, alignClass, justifyClass, widthClass]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={classes} {...domProps}>
      {children}
    </Component>
  );
});

export default Grid;
