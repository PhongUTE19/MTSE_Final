import { useEffect, useState } from 'react';
import { APP_ROUTES } from '../../shared/constants';
import {
  appUrl,
  exchangeCodeForSessionFromUrl,
  isSupabaseConfigured,
  supabase,
} from '../../shared/services/supabaseAuth';
import { validateStringLength } from '../../shared/utils/validation';
import { AUTH_LABELS, AUTH_MODES } from './authConstants';
import Button from '../../primitives/buttons/Button.jsx';
import Alert from '../../composites/feedback/Alert.jsx';
import { Stack } from '../../primitives/layout/index.js';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Link from '../../primitives/typography/Link.jsx';
import AuthLayout from './AuthLayout';
import PasswordField from './PasswordField';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;

    async function establishRecoverySession() {
      if (!isSupabaseConfigured || !supabase) {
        if (active) {
          setError(
            AUTH_LABELS.NOTICES.NOT_CONFIGURED_GENERIC ||
              'Password reset is unavailable because authentication is not configured.'
          );
        }
        return;
      }
      try {
        const { session, error: sessionError } = await exchangeCodeForSessionFromUrl();
        if (!active) return;
        if (sessionError || !session) {
          setError(
            sessionError?.message ||
              'This password-reset link is invalid or has expired. Request a new link and try again.'
          );
          return;
        }
        setReady(true);
      } catch (sessionError) {
        if (active) {
          setError(
            sessionError instanceof Error
              ? sessionError.message
              : 'We could not verify this password-reset link.'
          );
        }
      }
    }

    establishRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!validateStringLength(password, { min: 8, trim: false }).isValid) {
      setError(AUTH_LABELS.VALIDATION.PASSWORD_LENGTH);
      return;
    }
    if (password !== confirmation) {
      setError(AUTH_LABELS.VALIDATION.PASSWORD_MISMATCH);
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setError(AUTH_LABELS.NOTICES.NOT_CONFIGURED_GENERIC);
      return;
    }
    if (!ready) {
      setError('Verify the password-reset link before setting a new password.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setCompleted(true);
      setMessage('Password updated. Redirecting you to sign in…');
      window.setTimeout(
        () => window.location.replace(appUrl(`${APP_ROUTES.AUTH}?reset=success`)),
        1200
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'We could not update your password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  const controlsDisabled = loading || completed;

  let buttonText = 'Verifying reset link…';
  if (loading) {
    buttonText = 'Updating password…';
  } else if (completed) {
    buttonText = 'Password updated';
  } else if (ready) {
    buttonText = 'Update password';
  }

  return (
    <AuthLayout>
      <Card variant="glass" padding="xl" maxWidth="md">
        <Stack as="section" gap="lg">
          <CardHeader as="header">
            <Stack gap="xs">
              <Text variant="kicker">{AUTH_LABELS.KICKERS[AUTH_MODES.FORGOT]}</Text>
              <CardTitle as="h1" size="xl">Choose a new password</CardTitle>
              <Text variant="secondary">Use a password with at least eight characters.</Text>
            </Stack>
          </CardHeader>

          <form onSubmit={submit} noValidate>
            <Stack gap="md">
              {error && (
                <Alert variant="error">
                  {error}
                </Alert>
              )}
              {message && (
                <Alert variant="info">
                  {message}
                </Alert>
              )}

              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={controlsDisabled}
              />

              <PasswordField
                id="confirm-new-password"
                label="Confirm new password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={controlsDisabled}
              />

              <Button
                type="submit"
                variant="primary"
                disabled={controlsDisabled || !ready}
                loading={loading}
              >
                {buttonText}
              </Button>
            </Stack>
          </form>

          <Text variant="secondary" align="center">
            <Link to={APP_ROUTES.AUTH}>Return to sign in</Link>
          </Text>
        </Stack>
      </Card>
    </AuthLayout>
  );
}
