import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { appUrl, isSupabaseConfigured, signOut, supabase, getUserRole, safeNextPath } from '../../services/supabaseAuth';
import HandbookView from '../HandbookView';
import { ADMIN_TABS, USER_ROLES } from '../../constants';
import './admin.css';

function redirectToSignIn(targetPath = '/analytics') {
  window.location.replace(`${appUrl('/auth')}?next=${encodeURIComponent(safeNextPath(targetPath) || '/analytics')}`);
}

function redirectToExpense() {
  window.location.replace(appUrl('/expense'));
}

export default function AdminSessionGate({ defaultTab = ADMIN_TABS.ANALYTICS }) {
  const [session, setSession] = useState(undefined);
  const location = useLocation();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      redirectToSignIn(location.pathname);
      return undefined;
    }
    let active = true;
    const applySession = (currentSession) => {
      if (!active) return;
      if (!currentSession) {
        redirectToSignIn(location.pathname);
        return;
      }
      if (getUserRole(currentSession) !== 'admin') {
        redirectToExpense();
        return;
      }
      setSession(currentSession);
    };

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => applySession(currentSession));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => applySession(currentSession));
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [location.pathname]);

  if (!session) {
    return (
      <main className="admin-gate">
        <p>Checking administrator access…</p>
      </main>
    );
  }

  const displayName = session.user.user_metadata?.display_name || session.user.email || 'Administrator';

  const adminNavActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <Link className="admin-secondary-link" to="/expense">
        Open expense workspace
      </Link>
      <button
        type="button"
        className="admin-signout"
        onClick={async () => {
          await signOut();
          redirectToSignIn(location.pathname);
        }}
      >
        Sign out
      </button>
    </div>
  );

  return (
    <HandbookView
      role={USER_ROLES.ADMIN}
      kicker="SPENDWISE · ADMIN WORKSPACE"
      subtitle={<>Signed in as <strong>{displayName}</strong></>}
      headerActions={adminNavActions}
      defaultTab={defaultTab}
    />
  );
}
