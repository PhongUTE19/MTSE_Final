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

const ALIGN_CLASSES = {
  stretch: 'items-stretch',
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
};

const JUSTIFY_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

/**
 * Stack component for vertical layouts.
 * Arranges children vertically with consistent gap spacing.
 * Arbitrary className and style overrides are strictly stripped to enforce Design System control.
 *
 * @param {object} props
 * @param {'none'|'2xs'|'xs'|'sm'|'md'|'lg'|'xl'|'2xl'} [props.gap='md'] - Vertical gap
 * @param {'stretch'|'start'|'center'|'end'} [props.align] - Cross-axis alignment
 * @param {'start'|'center'|'end'|'between'|'around'} [props.justify] - Main-axis justification
 * @param {boolean} [props.fullWidth=false] - Whether stack takes full 100% width (and spans all grid columns)
 * @param {boolean} [props.flex1=false] - Whether stack expands with flex-1 min-h-0
 * @param {React.ElementType} [props.as='div'] - Element tag name
 * @param {React.ReactNode} props.children - Child elements
 */
const Stack = forwardRef(function Stack(
  {
    gap = 'md',
    align,
    justify,
    fullWidth = false,
    flex1 = false,
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
  const alignClass = align ? ALIGN_CLASSES[align] || '' : '';
  const justifyClass = justify ? JUSTIFY_CLASSES[justify] || '' : '';
  const widthClass = fullWidth ? 'w-full col-span-full' : '';
  const flexClass = flex1 ? 'flex-1 min-h-0' : '';

  const classes = ['flex flex-col', gapClass, alignClass, justifyClass, widthClass, flexClass]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={classes} {...domProps}>
      {children}
    </Component>
  );
});

export default Stack;
