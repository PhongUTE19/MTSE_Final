import { useState } from 'react';

/**
 * Reusable password input with show/hide toggle, validation error message,
 * and accessibility support.
 */
export function PasswordField({
  id,
  name = id,
  label,
  value,
  onChange,
  error,
  disabled = false,
  autoComplete = 'new-password',
  required = true,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-control">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          className="auth-password-toggle"
          type="button"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <p className="auth-field-error" id={`${id}-error`}>{error}</p> : null}
    </div>
  );
}

export default PasswordField;
