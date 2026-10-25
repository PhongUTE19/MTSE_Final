import { useEffect, useState } from 'react';
import ExpenseTrackerApp from './ExpenseTrackerApp';
import { appUrl, isSupabaseConfigured, safeNextPath, signOut, supabase } from '../../services/supabaseAuth';

function redirectToSignIn() {
  window.location.replace(`${appUrl('/auth')}?next=${encodeURIComponent(safeNextPath(window.location.pathname))}`);
}

export default function ExpenseSessionGate() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { redirectToSignIn(); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!active) return;
      if (!currentSession) redirectToSignIn(); else setSession(currentSession);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (currentSession) setSession(currentSession); else redirectToSignIn();
    });
    const onUnauthorized = () => redirectToSignIn();
    window.addEventListener('spendwise:unauthorized', onUnauthorized);
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener('spendwise:unauthorized', onUnauthorized); };
  }, []);
  if (!session) return <main className="expense-shell"><section className="expense-main"><p>Checking your session…</p></section></main>;
  return <ExpenseTrackerApp user={session.user} onSignOut={async () => { await signOut(); redirectToSignIn(); }} />;
}
