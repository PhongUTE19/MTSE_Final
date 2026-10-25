import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_ROUTES } from '../../constants';
import { AUTH_LABELS } from './authConstants';
import {
  appUrl,
  exchangeCodeForSessionFromUrl,
  formatAuthError,
  getPostAuthPath,
  getUserRole,
  isSupabaseConfigured,
  supabase,
} from '../../services/supabaseAuth';
import './auth.css';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing your secure sign-in…');

  useEffect(() => {
    async function complete() {
      if (!isSupabaseConfigured || !supabase) {
        setMessage(AUTH_LABELS.NOTICES.NOT_CONFIGURED_GENERIC);
        return;
      }
      const { session, error } = await exchangeCodeForSessionFromUrl();
      if (error) {
        setMessage(formatAuthError(error, 'callback'));
        return;
      }
      if (!session) {
        setMessage('We could not complete sign-in. Please return and try again.');
        return;
      }
      const role = getUserRole(session);
      const destination = getPostAuthPath(role, new URLSearchParams(window.location.search).get('next'));
      window.location.replace(appUrl(destination));
    }
    complete();
  }, []);

  return (
    <main className="auth-content auth-standalone">
      <section className="auth-card" aria-live="polite">
        <p className="auth-kicker">SPENDWISE</p>
        <h1>Finishing up</h1>
        <p>{message}</p>
        <Link className="auth-text-link" to={APP_ROUTES.AUTH}>
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
