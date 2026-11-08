import React from 'react';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Base Label component.
 * Standardizes form labels, required indicators, and accessibility across SpendWise.
 *
 * @param {object} props
 * @param {string} [props.htmlFor] - Associated control ID
 * @param {boolean} [props.required=false] - Whether to show required indicator
 * @param {React.ReactNode} props.children - Label text
 */
export default function Label({
  htmlFor,
  required = false,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);

  return (
    <label
      htmlFor={htmlFor}
      className="block mb-1 text-sm font-semibold text-content-secondary"
      {...domProps}
    >
      {children}
      {required && (
        <span className="text-error-accent ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}
