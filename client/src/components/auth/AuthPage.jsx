import { useEffect, useState } from 'react';
import { appUrl, isSupabaseConfigured, safeNextPath, supabase } from '../../services/supabaseAuth';
import './auth.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleMark() {
  return <svg className="auth-google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.35 12.23c0-.71-.06-1.4-.19-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.15c1.84-1.69 2.9-4.18 2.9-7.29Z" /><path fill="#34a853" d="M12 21.75c2.62 0 4.83-.87 6.45-2.36L15.3 16.9c-.9.6-2.05.96-3.3.96-2.53 0-4.67-1.7-5.44-4H3.3v2.6A9.75 9.75 0 0 0 12 21.75Z" /><path fill="#fbbc05" d="M6.56 13.86a5.87 5.87 0 0 1 0-3.72V7.55H3.3a9.75 9.75 0 0 0 0 8.9l3.26-2.59Z" /><path fill="#ea4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.82 3.22 14.62 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.3l3.26 2.59c.77-2.3 2.91-4 5.44-4Z" /></svg>;
}

function PasswordField({ id, label, value, onChange, error, autoComplete = 'new-password' }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password-control"><input id={id} name={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} required /><button className="auth-password-toggle" type="button" onClick={() => setVisible((current) => !current)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? 'Hide' : 'Show'}</button></div>{error && <p className="auth-field-error" id={`${id}-error`}>{error}</p>}</div>;
}

function validate(form, mode) {
  const errors = {};
  if (mode === 'signup' && !form.name.trim()) errors.name = 'Enter the name you want to use in Spendwise.';
  if (!EMAIL_PATTERN.test(form.email)) errors.email = 'Enter a valid email address.';
  if (mode !== 'forgot' && form.password.length < 8) errors.password = 'Use at least 8 characters.';
  if (mode === 'signup' && form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export default function AuthPage() {
  const [mode, setMode] = useState(new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(new URLSearchParams(window.location.search).get('reset') === 'success' ? 'Password updated. Sign in using your new password.' : '');
  const [loading, setLoading] = useState(false);
  const nextPath = safeNextPath(new URLSearchParams(window.location.search).get('next'));
  const isSignUp = mode === 'signup';
  const isForgot = mode === 'forgot';
  const updateField = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: '' })); setNotice(''); };
  const switchMode = (nextMode) => { setMode(nextMode); setErrors({}); setNotice(''); };

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => { if (mounted && session && !isForgot) window.location.replace(appUrl(nextPath)); });
    return () => { mounted = false; };
  }, [isForgot, nextPath]);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(form, mode);
    setErrors(nextErrors); setNotice('');
    if (Object.keys(nextErrors).length) return;
    if (!isSupabaseConfigured || !supabase) { setNotice('Authentication is not configured for this environment. Add the public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY variables to enable sign-in.'); return; }
    setLoading(true);
    try {
      if (isForgot) {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: appUrl('/reset-password') });
        if (requestError) setNotice(requestError.message);
        else setNotice('If an account exists for that email, a password-reset link has been sent.');
      } else if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { display_name: form.name.trim() }, emailRedirectTo: appUrl('/auth/callback') } });
        if (signUpError) setNotice(signUpError.message);
        else if (data.session) window.location.replace(appUrl(nextPath));
        else setNotice('Check your email to confirm your account before signing in.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (signInError) setNotice(signInError.message);
        else window.location.replace(appUrl(nextPath));
      }
    } catch (authError) {
      setNotice(authError instanceof Error ? authError.message : 'We could not complete that request. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setNotice('');
    if (!isSupabaseConfigured || !supabase) { setNotice('Authentication is not configured for this environment.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${appUrl('/auth/callback')}?next=${encodeURIComponent(nextPath)}` } });
      if (error) setNotice(error.message);
    } catch (authError) {
      setNotice(authError instanceof Error ? authError.message : 'We could not start Google sign-in. Please try again.');
    } finally {
      setLoading(false);
    }
  }


  const title = isForgot ? 'Reset your password' : isSignUp ? 'Create your workspace' : 'Welcome back';
  const description = isForgot ? 'Enter your email and we’ll send a secure reset link.' : isSignUp ? 'Set up your Spendwise workspace in a few moments.' : 'Sign in to continue managing your money with confidence.';
  return <main className="auth-page">
    <section className="auth-showcase" aria-label="Spendwise introduction"><div className="auth-showcase__brand"><span className="auth-logo" aria-hidden="true">S</span><span>spendwise</span></div><div className="auth-showcase__content"><p className="auth-showcase__eyebrow">PERSONAL FINANCE, SIMPLIFIED</p><h1>Make every money decision feel clearer.</h1><p>One calm workspace for your spending, receipts, and the habits behind them.</p><div className="auth-showcase__metrics"><div><strong>One view</strong><span>for every transaction</span></div><div><strong>Thoughtful</strong><span>receipt review</span></div></div></div><p className="auth-showcase__footer">Built for deliberate financial habits.</p></section>
    <section className="auth-content" aria-labelledby="auth-title"><div className="auth-mobile-brand"><span className="auth-logo" aria-hidden="true">S</span><span>spendwise</span></div><div className="auth-card"><div className="auth-card__header"><p className="auth-kicker">{isForgot ? 'ACCOUNT RECOVERY' : isSignUp ? 'GET STARTED' : 'SECURE ACCESS'}</p><h1 id="auth-title">{title}</h1><p>{description}</p></div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>{Object.keys(errors).length > 0 && <div className="auth-alert auth-alert--error" role="alert">Please correct the highlighted fields and try again.</div>}{notice && <div className="auth-alert auth-alert--info" role="status">{notice}</div>}{isSignUp && <div className="auth-field"><label htmlFor="name">Display name</label><input id="name" name="name" value={form.name} onChange={updateField} autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} required />{errors.name && <p className="auth-field-error" id="name-error">{errors.name}</p>}</div>}<div className="auth-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" inputMode="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} required />{errors.email && <p className="auth-field-error" id="email-error">{errors.email}</p>}</div>{!isForgot && <PasswordField id="password" label="Password" value={form.password} onChange={updateField} error={errors.password} autoComplete={isSignUp ? 'new-password' : 'current-password'} />}{isSignUp && <PasswordField id="confirmPassword" label="Confirm password" value={form.confirmPassword} onChange={updateField} error={errors.confirmPassword} />}{!isSignUp && !isForgot && <button className="auth-text-link auth-forgot-password" type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>}<button className="auth-primary-button" type="submit" disabled={loading}>{loading ? 'Please wait…' : isForgot ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}</button></form>
      {!isForgot && <><div className="auth-divider"><span>or</span></div><button className="auth-google-button" type="button" disabled={loading} onClick={signInWithGoogle}><GoogleMark />Continue with Google</button></>}<p className="auth-switch">{isForgot ? 'Remember your password?' : isSignUp ? 'Already have an account?' : 'New to Spendwise?'} <button type="button" onClick={() => switchMode(isForgot || isSignUp ? 'signin' : 'signup')}>{isForgot || isSignUp ? 'Sign in' : 'Create an account'}</button></p>{isSignUp && <p className="auth-legal">By creating an account, you agree to the terms and privacy policy that will be provided when authentication is enabled.</p>}</div></section>
  </main>;
}
