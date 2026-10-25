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
import { GoogleMark } from '../../shared/components/Icons';
import PasswordField from './PasswordField';
import { AUTH_LABELS, AUTH_MODES } from './authConstants';
import './auth.css';

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
  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';

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
          // Account already exists in Supabase Auth (obfuscated identity response)
          setNotice(AUTH_LABELS.NOTICES.ACCOUNT_EXISTS);
        } else if (data?.session) {
          // Reliable role resolution from trusted app_metadata
          const role = getUserRole(data.session);
          const destination = getPostAuthPath(role, nextParam);
          window.location.replace(appUrl(destination));
        } else {
          // Email confirmation is required; do not treat user as authenticated
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
    <main className="auth-page">
      <section className="auth-showcase" aria-label="Spendwise introduction">
        <div className="auth-showcase__brand">
          <span className="auth-logo" aria-hidden="true">S</span>
          <span>spendwise</span>
        </div>
        <div className="auth-showcase__content">
          <p className="auth-showcase__eyebrow">PERSONAL FINANCE, SIMPLIFIED</p>
          <h1>Make every money decision feel clearer.</h1>
          <p>One calm workspace for your spending, receipts, and the habits behind them.</p>
          <div className="auth-showcase__metrics">
            <div>
              <strong>One view</strong>
              <span>for every transaction</span>
            </div>
            <div>
              <strong>Thoughtful</strong>
              <span>receipt review</span>
            </div>
          </div>
        </div>
        <p className="auth-showcase__footer">Built for deliberate financial habits.</p>
      </section>

      <section className="auth-content" aria-labelledby="auth-title">
        <div className="auth-mobile-brand">
          <span className="auth-logo" aria-hidden="true">S</span>
          <span>spendwise</span>
        </div>
        <div className="auth-card">
          <div className="auth-card__header">
            <p className="auth-kicker">{kicker}</p>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {Object.keys(errors).length > 0 && (
              <div className="auth-alert auth-alert--error" role="alert">
                {AUTH_LABELS.NOTICES.VALIDATION_SUMMARY}
              </div>
            )}
            {notice && (
              <div className="auth-alert auth-alert--info" role="status">
                {notice}
              </div>
            )}

            {isSignUp && (
              <div className="auth-field">
                <label htmlFor="name">Display name</label>
                <input
                  id="name"
                  name="name"
                  value={form.name}
                  onChange={updateField}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  required
                />
                {errors.name && <p className="auth-field-error" id="name-error">{errors.name}</p>}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                autoComplete="email"
                inputMode="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                required
              />
              {errors.email && <p className="auth-field-error" id="email-error">{errors.email}</p>}
            </div>

            {!isForgot && (
              <PasswordField
                id="password"
                label="Password"
                value={form.password}
                onChange={updateField}
                error={errors.password}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            )}

            {isSignUp && (
              <PasswordField
                id="confirmPassword"
                label="Confirm password"
                value={form.confirmPassword}
                onChange={updateField}
                error={errors.confirmPassword}
              />
            )}

            {!isSignUp && !isForgot && (
              <button
                className="auth-text-link auth-forgot-password"
                type="button"
                onClick={() => switchMode(AUTH_MODES.FORGOT)}
              >
                {AUTH_LABELS.BUTTONS.FORGOT_PASSWORD}
              </button>
            )}

            <button className="auth-primary-button" type="submit" disabled={loading}>
              {loading
                ? AUTH_LABELS.BUTTONS.SUBMIT_LOADING
                : isForgot
                  ? AUTH_LABELS.BUTTONS.SUBMIT_FORGOT
                  : isSignUp
                    ? AUTH_LABELS.BUTTONS.SUBMIT_SIGNUP
                    : AUTH_LABELS.BUTTONS.SUBMIT_SIGNIN}
            </button>
          </form>

          {!isForgot && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <button className="auth-google-button" type="button" disabled={loading} onClick={signInWithGoogle}>
                <GoogleMark />
                {AUTH_LABELS.BUTTONS.GOOGLE_SIGNIN}
              </button>
            </>
          )}

          <p className="auth-switch">
            {isForgot
              ? AUTH_LABELS.SWITCH_PROMPTS.FORGOT
              : isSignUp
                ? AUTH_LABELS.SWITCH_PROMPTS.SIGNUP
                : AUTH_LABELS.SWITCH_PROMPTS.SIGNIN}
            {' '}
            <button
              type="button"
              onClick={() => switchMode(isForgot || isSignUp ? AUTH_MODES.SIGNIN : AUTH_MODES.SIGNUP)}
            >
              {isForgot || isSignUp
                ? AUTH_LABELS.BUTTONS.SWITCH_TO_SIGNIN
                : AUTH_LABELS.BUTTONS.SWITCH_TO_SIGNUP}
            </button>
          </p>

          {isSignUp && (
            <p className="auth-legal">
              {AUTH_LABELS.NOTICES.TERMS_NOTICE}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
