import React, { forwardRef } from 'react';
import { omitProps } from '../shared/utils/domProps.js';

export const BACKDROP_VARIANTS = {
  default: 'bg-overlay',
  blur: 'bg-overlay-blur backdrop-blur-xs',
  dark: 'bg-overlay-dark',
  transparent: 'bg-transparent',
};

/**
 * Base Backdrop Component.
 * Independent, reusable viewport overlay surface primitive for modals, drawers, and popups.
 *
 * @param {object} props
 * @param {boolean} [props.open=true] - Whether the backdrop is visible
 * @param {() => void} [props.onDismiss] - Callback requesting dismissal when backdrop itself is activated
 * @param {boolean} [props.dismissible=true] - Whether activation requests dismissal
 * @param {'default'|'blur'|'dark'|'transparent'} [props.variant='default'] - Visual style variant
 * @param {'center'|'top'} [props.align='center'] - Vertical alignment when wrapping modal children
 * @param {React.ReactNode} [props.children] - Optional overlay children (e.g., modal surface)
 */
export const Backdrop = forwardRef(function Backdrop(
  {
    open = true,
    onDismiss,
    dismissible = true,
    variant = 'default',
    align = 'center',
    children,
    ...rest
  },
  ref
) {
  // Enforce Strict Component Styling Policy: strip arbitrary className and style overrides
  const domProps = omitProps(rest);

  if (!open) {
    return null;
  }

  const variantClass = BACKDROP_VARIANTS[variant] || BACKDROP_VARIANTS.default;
  const containerClass = children
    ? `flex justify-center p-4 overflow-y-auto ${align === 'top' ? 'items-start' : 'items-center'}`
    : '';
  const classes = ['fixed inset-0 z-backdrop transition-opacity duration-200', variantClass, containerClass]
    .filter(Boolean)
    .join(' ');

  const handleMouseDown = (event) => {
    // Only dismiss if the interaction originated on the backdrop container itself,
    // preventing accidental dismissal when dragging or selecting text inside children.
    if (dismissible && onDismiss && event.target === event.currentTarget) {
      onDismiss(event);
    }
  };

  const handleClick = (event) => {
    // For standalone backdrops without children (e.g., OverlayDrawer backdrop layer)
    if (!children && dismissible && onDismiss && event.target === event.currentTarget) {
      onDismiss(event);
    }
  };

  return (
    <div
      ref={ref}
      className={classes}
      role={children ? 'presentation' : undefined}
      aria-hidden={children ? undefined : 'true'}
      onMouseDown={children ? handleMouseDown : undefined}
      onClick={!children ? handleClick : undefined}
      {...domProps}
    >
      {children}
    </div>
  );
});

export default Backdrop;
