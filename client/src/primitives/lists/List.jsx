import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const LIST_VARIANTS = {
  unstyled: 'list-none',
  bulleted: 'list-disc pl-4',
  divided: 'list-none divide-y divide-border [&>*]:py-2 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0',
  cards: 'list-none',
};

const LIST_GAPS = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

/**
 * List Base Component.
 * Standardizes semantic lists (ul / ol) with controlled spacing and presentation.
 *
 * @param {object} props
 * @param {'ul'|'ol'} [props.as='ul'] - List element tag
 * @param {'unstyled'|'bulleted'|'divided'|'cards'} [props.variant='unstyled'] - Presentation variant
 * @param {'none'|'xs'|'sm'|'md'|'lg'} [props.gap='xs'] - Gap between list items
 * @param {React.ReactNode} props.children - List items
 */
const List = forwardRef(function List(
  {
    as: Component = 'ul',
    variant = 'unstyled',
    gap = 'xs',
    children,
    ...rest
  },
  ref
) {
  const domProps = omitProps(rest);

  const variantClass = LIST_VARIANTS[variant] || LIST_VARIANTS.unstyled;
  const gapClass = LIST_GAPS[gap] || LIST_GAPS.xs;
  const classes = ['m-0 p-0 flex flex-col', variantClass, gapClass].filter(Boolean).join(' ');

  return (
    <Component ref={ref} className={classes} {...domProps}>
      {children}
    </Component>
  );
});

export default List;
