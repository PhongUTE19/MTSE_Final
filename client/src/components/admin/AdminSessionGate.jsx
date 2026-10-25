import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { appUrl, isSupabaseConfigured, signOut, supabase } from '../../services/supabaseAuth';
import './admin.css';

function redirectToSignIn() {
  window.location.replace(`${appUrl('/auth')}?next=${encodeURIComponent('/admin')}`);
}

function redirectToExpense() {
  window.location.replace(appUrl('/expense'));
}

export default function AdminSessionGate() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { redirectToSignIn(); return undefined; }
    let active = true;
    const applySession = (currentSession) => {
      if (!active) return;
      if (!currentSession) { redirectToSignIn(); return; }
      if (currentSession.user.app_metadata?.role !== 'admin') { redirectToExpense(); return; }
      setSession(currentSession);
    };
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => applySession(currentSession));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => applySession(currentSession));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (!session) return <main className="admin-gate"><p>Checking administrator access…</p></main>;
  const displayName = session.user.user_metadata?.display_name || session.user.email || 'Administrator';
  return <main className="admin-gate">
    <section className="admin-card" aria-labelledby="admin-title">
      <p className="auth-kicker">SPENDWISE · ADMIN</p>
      <h1 id="admin-title">Administrator workspace</h1>
      <p>You are signed in as <strong>{displayName}</strong>. Your administrator role has been verified.</p>
      <div className="admin-card__actions">
        <Link className="admin-secondary-link" to="/expense">Open expense workspace</Link>
        <button type="button" className="admin-signout" onClick={async () => { await signOut(); redirectToSignIn(); }}>Sign out</button>
      </div>
    </section>
  </main>;
}
