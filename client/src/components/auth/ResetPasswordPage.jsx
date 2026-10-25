import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { appUrl, exchangeCodeForSessionFromUrl, isSupabaseConfigured, supabase } from '../../services/supabaseAuth';
import './auth.css';

function PasswordField({ id, label, value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-control">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        disabled={disabled}
        required
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
  </div>;
}

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
      if (!isSupabaseConfigured || !supabase) return;
      try {
        const { session, error: sessionError } = await exchangeCodeForSessionFromUrl();
        if (!active) return;
        if (sessionError || !session) {
          setError(sessionError?.message || 'This password-reset link is invalid or has expired. Request a new link and try again.');
          return;
        }
        setReady(true);
      } catch (sessionError) {
        if (active) setError(sessionError instanceof Error ? sessionError.message : 'We could not verify this password-reset link.');
      }
    }
    establishRecoverySession();
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    if (!isSupabaseConfigured || !supabase) { setError('Authentication has not been configured for this environment.'); return; }
    if (!ready) { setError('Verify the password-reset link before setting a new password.'); return; }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setCompleted(true);
      setMessage('Password updated. Redirecting you to sign in…');
      window.setTimeout(() => window.location.replace(appUrl('/auth?reset=success')), 1200);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'We could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  const controlsDisabled = loading || completed;
  return <main className="auth-content auth-standalone"><section className="auth-card"><p className="auth-kicker">ACCOUNT RECOVERY</p><h1>Choose a new password</h1><p className="auth-copy">Use a password with at least eight characters.</p><form className="auth-form" onSubmit={submit} noValidate>{error && <div className="auth-alert auth-alert--error" role="alert">{error}</div>}{message && <div className="auth-alert auth-alert--info" role="status">{message}</div>}<PasswordField id="new-password" label="New password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={controlsDisabled} /><PasswordField id="confirm-new-password" label="Confirm new password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={controlsDisabled} /><button className="auth-primary-button" disabled={controlsDisabled || !ready}>{loading ? 'Updating password…' : completed ? 'Password updated' : ready ? 'Update password' : 'Verifying reset link…'}</button></form><p className="auth-switch"><Link to="/auth">Return to sign in</Link></p></section></main>;
}
