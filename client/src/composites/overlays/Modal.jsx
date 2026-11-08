import React, { forwardRef } from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

export const MODAL_SIZES = {
  sm: 'max-w-modal-sm',
  md: 'max-w-modal-md',
  lg: 'max-w-modal-lg',
  xl: 'max-w-modal-xl',
  full: 'max-w-full',
};

export const MODAL_VARIANTS = {
  default: '',
  danger: 'border-danger-border',
};

/**
 * Composite Modal surface dialog container.
 * Encapsulates accessible dialog attributes, sizing variants, and surface styling.
 *
 * @param {object} props
 * @param {React.ElementType} [props.as='div']
 * @param {'sm'|'md'|'lg'|'xl'|'full'} [props.size='lg']
 * @param {'default'|'danger'} [props.variant='default']
 * @param {string} [props.role='dialog']
 * @param {boolean} [props.ariaModal=true]
 * @param {string} [props.ariaLabelledby]
 * @param {string} [props.ariaDescribedby]
 * @param {React.ReactNode} props.children
 */
export const Modal = forwardRef(function Modal(
  {
    as: Component = 'div',
    size = 'lg',
    variant = 'default',
    role = 'dialog',
    ariaModal = true,
    ariaLabelledby,
    ariaDescribedby,
    children,
    ...rest
  },
  ref
) {
  // Strip arbitrary className and style overrides per Strict Component Styling Policy
  const {
    'aria-labelledby': ariaLabelledbyKebab,
    'aria-describedby': ariaDescribedbyKebab,
    ...restProps
  } = rest;
  const domProps = omitProps(restProps);

  const sizeClass = MODAL_SIZES[size] || MODAL_SIZES.lg;
  const variantClass = MODAL_VARIANTS[variant] || '';
  const baseClasses = 'bg-surface rounded-xl border border-border w-full p-6 shadow-modal max-h-modal overflow-y-auto';
  const classes = `${baseClasses} ${sizeClass} ${variantClass}`.trim();
  const resolvedLabelledby = ariaLabelledby || ariaLabelledbyKebab;
  const resolvedDescribedby = ariaDescribedby || ariaDescribedbyKebab;

  return (
    <Component
      ref={ref}
      className={classes}
      role={role}
      aria-modal={ariaModal ? 'true' : undefined}
      aria-labelledby={resolvedLabelledby}
      aria-describedby={resolvedDescribedby}
      {...domProps}
    >
      {children}
    </Component>
  );
});

export default Modal;
