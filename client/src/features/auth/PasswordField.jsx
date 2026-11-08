import React from 'react';
import PasswordInput from '../../primitives/inputs/PasswordInput.jsx';
import Label from '../../primitives/labels/Label.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import { Stack } from '../../primitives/layout/index.js';

/**
 * Reusable password input with show/hide toggle, validation error message,
 * and accessibility support. Composes Base Stack, Label, PasswordInput, and ErrorText directly.
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
  return (
    <Stack gap="xs">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        invalid={Boolean(error)}
        label={label}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <ErrorText id={`${id}-error`} role="alert">
          {error}
        </ErrorText>
      ) : null}
    </Stack>
  );
}

export default PasswordField;
