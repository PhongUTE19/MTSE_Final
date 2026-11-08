import React from 'react';
import { GoogleMark } from '../../primitives/display/Icons.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import Label from '../../primitives/labels/Label.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Divider from '../../primitives/layout/Divider.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import Alert from '../../composites/feedback/Alert.jsx';
import PasswordField from './PasswordField.jsx';
import { AUTH_LABELS, AUTH_MODES } from './authConstants.js';

/**
 * Authentication form and OAuth action block for sign-in, sign-up, and password reset.
 */
export default function AuthForm({
  mode,
  form,
  errors,
  notice,
  loading,
  submitLabel,
  onFieldChange,
  onSubmit,
  onSwitchMode,
  onGoogleSignIn,
}) {
  const isSignUp = mode === AUTH_MODES.SIGNUP;
  const isForgot = mode === AUTH_MODES.FORGOT;

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          {notice && <Alert variant="info">{notice}</Alert>}

          {isSignUp && (
            <Stack gap="xs">
              <Label htmlFor="name">Display name</Label>
              <TextInput
                id="name"
                name="name"
                value={form.name}
                onChange={onFieldChange}
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'name-error' : undefined}
                required
              />
              {errors.name && (
                <ErrorText id="name-error" role="alert">
                  {errors.name}
                </ErrorText>
              )}
            </Stack>
          )}

          <Stack gap="xs">
            <Label htmlFor="email">Email address</Label>
            <TextInput
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={onFieldChange}
              autoComplete="email"
              inputMode="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              required
            />
            {errors.email && (
              <ErrorText id="email-error" role="alert">
                {errors.email}
              </ErrorText>
            )}
          </Stack>

          {!isForgot && (
            <PasswordField
              id="password"
              label="Password"
              value={form.password}
              onChange={onFieldChange}
              error={errors.password}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          )}

          {isSignUp && (
            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              value={form.confirmPassword}
              onChange={onFieldChange}
              error={errors.confirmPassword}
            />
          )}

          {mode === AUTH_MODES.SIGNIN && (
            <Inline justify="end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSwitchMode(AUTH_MODES.FORGOT)}
              >
                {AUTH_LABELS.BUTTONS.FORGOT_PASSWORD}
              </Button>
            </Inline>
          )}

          <Button type="submit" variant="primary" disabled={loading} loading={loading}>
            {submitLabel}
          </Button>
        </Stack>
      </form>

      {!isForgot && (
        <>
          <Divider label="or" spacing="md" />
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onGoogleSignIn}
            icon={<GoogleMark />}
          >
            {AUTH_LABELS.BUTTONS.GOOGLE_SIGNIN}
          </Button>
        </>
      )}
    </>
  );
}
