import React, { forwardRef } from 'react';
import Button from './Button.jsx';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Base IconButton component for icon-only actions.
 * Enforces accessible naming via `aria-label` while providing consistent sizing,
 * focus rings, and hover states. Applies icon-only styling via the controlled iconOnly prop.
 *
 * @param {object} props
 * @param {string} props['aria-label'] - Required accessible name for screen readers
 * @param {string} [props.title] - Optional tooltip text; defaults to aria-label
 * @param {'ghost'|'secondary'|'primary'|'danger'|'outline'|'fab'} [props.variant='ghost'] - Button variant
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Button size
 * @param {React.ReactNode} [props.icon] - Icon content (or passed via children)
 * @param {React.ReactNode} [props.children] - Icon content if icon prop is omitted
 */
const IconButton = forwardRef(function IconButton(
  {
    'aria-label': ariaLabel,
    title,
    variant = 'ghost',
    size = 'md',
    icon,
    children,
    ...rest
  },
  ref
) {
  const accessibleName = ariaLabel || title;
  const tooltip = title || ariaLabel;
  const domProps = omitProps(rest);

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      iconOnly
      aria-label={accessibleName}
      title={tooltip}
      {...domProps}
    >
      {icon || children}
    </Button>
  );
});

export default IconButton;
