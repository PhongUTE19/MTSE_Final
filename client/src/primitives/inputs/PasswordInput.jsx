import React, { forwardRef, useState } from 'react';
import TextInput from './TextInput.jsx';
import { omitProps } from '../../shared/utils/domProps.js';
import Button from '../buttons/Button.jsx';

/**
 * Reusable PasswordInput component with visibility toggle.
 *
 * @param {object} props
 * @param {string} [props.id] - Field ID
 * @param {string} [props.name] - Field name
 * @param {string} [props.value] - Controlled value
 * @param {function} [props.onChange] - Change handler
 * @param {'sm'|'md'|'lg'} [props.size='md'] - Input size modifier
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {boolean} [props.required=false] - Required state
 * @param {boolean} [props.invalid=false] - Error state
 * @param {string} [props.label='password'] - Context label for toggle button aria-label
 * @param {string} [props.autoComplete='current-password'] - Browser autocomplete hint
 */
const PasswordInput = forwardRef(function PasswordInput(
  {
    id,
    name = id,
    value,
    onChange,
    size = 'md',
    disabled = false,
    required = false,
    invalid = false,
    label = 'password',
    autoComplete = 'current-password',
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref
) {
  const [visible, setVisible] = useState(false);
  const inputProps = omitProps(rest);

  return (
    <div className="relative flex items-center w-full">
      <TextInput
        ref={ref}
        id={id}
        name={name}
        size={size}
        endPadding="lg"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        invalid={invalid}
        aria-describedby={ariaDescribedBy}
        {...inputProps}
      />
      <span className="absolute right-1.5 inline-flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </Button>
      </span>
    </div>
  );
});

export default PasswordInput;
