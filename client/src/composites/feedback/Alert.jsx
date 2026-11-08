import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

const VARIANT_CLASSES = {
  error: 'bg-error-bg text-error-text border-error-border',
  danger: 'bg-error-bg text-error-text border-error-border',
  success: 'bg-success-bg text-success-text border-success-border',
  warning: 'bg-warning-bg text-warning-text border-warning-border',
  info: 'bg-info-bg text-info-text border-info-border',
};

/**
 * Standardized Alert composite component for inline and contextual feedback messages.
 *
 * @param {object} props
 * @param {'info' | 'error' | 'warning' | 'success' | 'danger'} [props.variant='info'] - Visual sentiment variant
 * @param {string} [props.role] - ARIA role ('alert' or 'status'). Defaults based on variant.
 * @param {string} [props.as='div'] - Element type to render ('div', 'section', etc.)
 * @param {React.ReactNode} [props.action] - Optional action button or element
 * @param {React.ReactNode} props.children - Alert content
 */
export default function Alert({
  variant = 'info',
  role,
  as: Component = 'div',
  action,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);
  const resolvedRole = role || (variant === 'error' || variant === 'danger' ? 'alert' : 'status');
  const resolvedAriaLive = variant === 'error' || variant === 'danger' ? 'assertive' : 'polite';
  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.info;

  const classes = `p-3 px-3.5 rounded-md text-sm flex justify-between items-center gap-3 border ${variantClass}`.trim();

  return (
    <Component
      className={classes}
      role={resolvedRole}
      aria-live={resolvedAriaLive}
      {...domProps}
    >
      <div className="flex-1 min-w-0">
        {children}
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </Component>
  );
}
