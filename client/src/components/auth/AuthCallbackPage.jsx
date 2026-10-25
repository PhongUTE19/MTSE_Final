import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  appUrl,
  exchangeCodeForSessionFromUrl,
  isSupabaseConfigured,
  safeNextPath,
  supabase,
} from '../../services/supabaseAuth';
import './auth.css';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing your secure sign-in…');

  useEffect(() => {
    async function complete() {
      if (!isSupabaseConfigured || !supabase) {
        setMessage('Authentication has not been configured for this environment.');
        return;
      }
      const { session, error } = await exchangeCodeForSessionFromUrl();
      if (error) { setMessage(error.message); return; }
      if (!session) { setMessage('We could not complete sign-in. Please return and try again.'); return; }
      window.location.replace(appUrl(safeNextPath(new URLSearchParams(window.location.search).get('next'))));
    }
    complete();
  }, []);

  return <main className="auth-content auth-standalone"><section className="auth-card" aria-live="polite"><p className="auth-kicker">SPENDWISE</p><h1>Finishing up</h1><p>{message}</p><Link className="auth-text-link" to="/auth">Return to sign in</Link></section></main>;
}
