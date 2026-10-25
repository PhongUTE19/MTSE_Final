import React, { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  appUrl,
  getUserRole,
  safeNextPath,
  signOut,
} from '../../services/supabaseAuth';
import { useSession } from '../../hooks';
import HandbookView from '../HandbookView';
import { ADMIN_TABS, USER_ROLES } from '../../constants';
import './admin.css';

function redirectToSignIn(targetPath = '/analytics') {
  const next = encodeURIComponent(safeNextPath(targetPath) || '/analytics');
  window.location.replace(`${appUrl('/auth')}?next=${next}`);
}

function redirectToExpense() {
  window.location.replace(appUrl('/expense'));
}

export default function AdminSessionGate({ defaultTab = ADMIN_TABS.ANALYTICS }) {
  const location = useLocation();

  const handleUnauthorized = useCallback(() => {
    redirectToSignIn(location.pathname);
  }, [location.pathname]);

  const handleValidate = useCallback((currentSession) => {
    if (getUserRole(currentSession) !== 'admin') {
      redirectToExpense();
      return false;
    }
    return true;
  }, []);

  const { session } = useSession({
    onValidate: handleValidate,
    onUnauthorized: handleUnauthorized,
  });

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
