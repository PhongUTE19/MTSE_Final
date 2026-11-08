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
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
};

const JUSTIFY_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

/**
 * Inline component for horizontal layouts.
 * Arranges children horizontally with consistent gap spacing and optional wrapping.
 * Arbitrary className and style overrides are strictly stripped to enforce Design System control.
 *
 * @param {object} props
 * @param {'none'|'2xs'|'xs'|'sm'|'md'|'lg'|'xl'|'2xl'} [props.gap='sm'] - Horizontal gap
 * @param {'start'|'center'|'end'|'baseline'|'stretch'} [props.align='center'] - Cross-axis alignment
 * @param {'start'|'center'|'end'|'between'|'around'} [props.justify='start'] - Main-axis justification
 * @param {boolean} [props.wrap=false] - Whether items wrap to the next line
 * @param {boolean} [props.fullWidth=false] - Whether inline takes full 100% width
 * @param {boolean} [props.flex1=false] - Whether inline expands with flex-1 min-w-0
 * @param {React.ElementType} [props.as='div'] - Element tag name
 * @param {React.ReactNode} props.children - Child elements
 */
const Inline = forwardRef(function Inline(
  {
    gap = 'sm',
    align = 'center',
    justify = 'start',
    wrap = false,
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
  const wrapClass = wrap ? 'flex-wrap' : 'flex-nowrap';
  const widthClass = fullWidth ? 'w-full' : '';
  const flexClass = flex1 ? 'flex-1 min-w-0' : '';

  const classes = ['flex flex-row', gapClass, alignClass, justifyClass, wrapClass, widthClass, flexClass]
    .filter(Boolean)
    .join(' ');

  return (
    <Component ref={ref} className={classes} {...domProps}>
      {children}
    </Component>
  );
});

export default Inline;
