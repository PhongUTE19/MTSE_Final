import React from 'react';
import Inline from '../../primitives/layout/Inline.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Standardized EmptyState composite component for zero-data views, search misses,
 * and empty collections across SpendWise.
 *
 * @param {object} props
 * @param {string} [props.message] - Empty state message or description
 * @param {React.ReactNode} [props.icon] - Optional leading icon
 * @param {React.ReactNode} [props.actions] - Optional action buttons (e.g. create or retry)
 * @param {boolean} [props.compact=false] - Whether to render compact padding and text
 * @param {string} [props.as='div'] - Element type to render ('div', 'td', 'p', etc.)
 * @param {React.ReactNode} props.children - Direct child elements
 */
export default function EmptyState({
  message,
  icon,
  actions,
  compact = false,
  as: Component = 'div',
  children,
  ...rest
}) {
  const domProps = omitProps(rest);
  const paddingClass = compact ? 'py-4 px-4 text-sm' : 'py-8 px-4 text-base';
  const classes = `flex flex-col items-center justify-center text-center text-content-muted ${paddingClass}`.trim();

  return (
    <Component className={classes} {...domProps}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {message && <Text as="p" color="muted">{message}</Text>}
      {children}
      {actions && (
        <Inline justify="center" gap="sm">
          {actions}
        </Inline>
      )}
    </Component>
  );
}
