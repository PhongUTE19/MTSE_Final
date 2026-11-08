import { useEffect, useState } from 'react';
import {
  appUrl,
  formatAuthError,
  getPostAuthPath,
  getUserRole,
  isSupabaseConfigured,
  safeNextPath,
  supabase,
} from '../../shared/services/supabaseAuth';
import { APP_ROUTES } from '../../shared/constants';
import { validateEmail, validateStringLength } from '../../shared/utils/validation';
import Button from '../../primitives/buttons/Button.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import { Stack } from '../../primitives/layout/index.js';
import AuthLayout from './AuthLayout';
import AuthShowcase from './AuthShowcase.jsx';
import AuthForm from './AuthForm.jsx';
import { AUTH_LABELS, AUTH_MODE_ACTIONS, AUTH_MODES } from './authConstants';

function validate(form, mode) {
  const errors = {};
  if (mode === AUTH_MODES.SIGNUP && !form.name.trim()) {
    errors.name = AUTH_LABELS.VALIDATION.NAME_REQUIRED;
  }
  if (!validateEmail(form.email).isValid) {
    errors.email = AUTH_LABELS.VALIDATION.EMAIL_INVALID;
  }
  if (
    mode !== AUTH_MODES.FORGOT &&
    !validateStringLength(form.password, { min: 8, trim: false }).isValid
  ) {
    errors.password = AUTH_LABELS.VALIDATION.PASSWORD_LENGTH;
  }
  if (mode === AUTH_MODES.SIGNUP && form.password !== form.confirmPassword) {
    errors.confirmPassword = AUTH_LABELS.VALIDATION.PASSWORD_MISMATCH;
  }
  return errors;
}

export default function AuthPage() {
  const [mode, setMode] = useState(
    new URLSearchParams(window.location.search).get('mode') === AUTH_MODES.SIGNUP
      ? AUTH_MODES.SIGNUP
      : AUTH_MODES.SIGNIN
  );
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(
    new URLSearchParams(window.location.search).get('reset') === 'success'
      ? AUTH_LABELS.NOTICES.RESET_SUCCESS
      : ''
  );

  const [loading, setLoading] = useState(false);
  const nextParam = new URLSearchParams(window.location.search).get('next');
  const nextPath = safeNextPath(nextParam);
  const isSignUp = mode === AUTH_MODES.SIGNUP;
  const isForgot = mode === AUTH_MODES.FORGOT;
  const modeActions = AUTH_MODE_ACTIONS[mode];

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: '' }));
    setNotice('');
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setNotice('');
  };

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session && !isForgot) {
        const role = getUserRole(session);
        const destination = getPostAuthPath(
          role,
          new URLSearchParams(window.location.search).get('next')
        );
        window.location.replace(appUrl(destination));
      }
    });
    return () => { mounted = false; };
  }, [isForgot]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    const nextErrors = validate(form, mode);
    setErrors(nextErrors);
    setNotice('');
    if (Object.keys(nextErrors).length) return;
    if (!isSupabaseConfigured || !supabase) {
      setNotice(AUTH_LABELS.NOTICES.NOT_CONFIGURED);
      return;
    }
    setLoading(true);
    try {
      if (isForgot) {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: appUrl(APP_ROUTES.RESET_PASSWORD),
        });
        if (requestError) setNotice(formatAuthError(requestError, AUTH_MODES.FORGOT));
        else setNotice(AUTH_LABELS.NOTICES.RESET_LINK_SENT);
      } else if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { display_name: form.name.trim() },
            emailRedirectTo: appUrl(APP_ROUTES.AUTH_CALLBACK),
          },
        });

        if (signUpError) {
          setNotice(formatAuthError(signUpError, AUTH_MODES.SIGNUP));
        } else if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setNotice(AUTH_LABELS.NOTICES.ACCOUNT_EXISTS);
        } else if (data?.session) {
          const role = getUserRole(data.session);
          const destination = getPostAuthPath(role, nextParam);
          window.location.replace(appUrl(destination));
        } else {
          setNotice(AUTH_LABELS.NOTICES.CONFIRM_EMAIL);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (signInError) {
          setNotice(formatAuthError(signInError, AUTH_MODES.SIGNIN));
        } else {
          const role = getUserRole(data?.session);
          const destination = getPostAuthPath(role, nextParam);
          window.location.replace(appUrl(destination));
        }
      }
    } catch (authError) {
      setNotice(formatAuthError(authError, mode));
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setNotice('');
    if (!isSupabaseConfigured || !supabase) {
      setNotice(AUTH_LABELS.NOTICES.NOT_CONFIGURED_GENERIC);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${appUrl(APP_ROUTES.AUTH_CALLBACK)}?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) setNotice(formatAuthError(error, AUTH_MODES.SIGNIN));
    } catch (authError) {
      setNotice(formatAuthError(authError, AUTH_MODES.SIGNIN));
    } finally {
      setLoading(false);
    }
  }

  const title = AUTH_LABELS.TITLES[mode] || AUTH_LABELS.TITLES[AUTH_MODES.SIGNIN];
  const description = AUTH_LABELS.DESCRIPTIONS[mode] || AUTH_LABELS.DESCRIPTIONS[AUTH_MODES.SIGNIN];
  const kicker = AUTH_LABELS.KICKERS[mode] || AUTH_LABELS.KICKERS[AUTH_MODES.SIGNIN];

  return (
    <AuthLayout showcase={<AuthShowcase />} ariaLabelledby="auth-title">
      <Card variant="glass" padding="xl" maxWidth="md">
        <Stack gap="lg">
          <CardHeader as="header">
            <Stack gap="xs">
              <Text variant="kicker">{kicker}</Text>
              <CardTitle as="h1" id="auth-title">{title}</CardTitle>
              <Text variant="secondary">{description}</Text>
            </Stack>
          </CardHeader>

          <AuthForm
            mode={mode}
            form={form}
            errors={errors}
            notice={notice}
            loading={loading}
            submitLabel={modeActions.submitLabel}
            onFieldChange={updateField}
            onSubmit={handleSubmit}
            onSwitchMode={switchMode}
            onGoogleSignIn={signInWithGoogle}
          />

          <Text variant="secondary" align="center">
            {modeActions.switchPrompt}
            {' '}
            <Button
              type="button"
              variant="ghost"
              onClick={() => switchMode(modeActions.switchTo)}
            >
              {modeActions.switchLabel}
            </Button>
          </Text>

          {isSignUp && (
            <Text variant="caption" align="center">
              {AUTH_LABELS.NOTICES.TERMS_NOTICE}
            </Text>
          )}
        </Stack>
      </Card>
    </AuthLayout>
  );
}
