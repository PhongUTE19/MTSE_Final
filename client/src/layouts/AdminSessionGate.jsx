import React, { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  appUrl,
  getUserRole,
  safeNextPath,
  signOut,
} from '../shared/services/supabaseAuth';
import { useSession, useHealth } from '../shared/hooks';
import AppSidebar from './AppSidebar';
import HealthBadge from '../shared/components/HealthBadge';
import { ToastProvider } from '../shared/contexts/ToastContext';
import AdminDashboard from './AdminDashboard';
import { ADMIN_TABS, APP_ROUTES, USER_ROLES } from '../shared/constants';
import '../features/expense/expenseTracker.css';
import './adminSessionGate.css';

function redirectToSignIn(targetPath = APP_ROUTES.ADMIN_ANALYTICS) {
  const next = encodeURIComponent(safeNextPath(targetPath) || APP_ROUTES.ADMIN_ANALYTICS);
  window.location.replace(`${appUrl(APP_ROUTES.AUTH)}?next=${next}`);
}

function redirectToExpense() {
  window.location.replace(appUrl(APP_ROUTES.EXPENSE));
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

  const { health, checkHealth } = useHealth(USER_ROLES.ADMIN);

  if (!session) {
    return (
      <main className="admin-gate">
        <p>Checking administrator access…</p>
      </main>
    );
  }

  const isKnowledgeView =
    location.pathname === APP_ROUTES.ADMIN_KNOWLEDGE || location.pathname === '/admin';
  const activeView = isKnowledgeView ? 'knowledge' : 'analytics';
  const pageTitle = activeView === 'analytics' ? 'AI Usage' : 'Knowledge Base';

  const handleSignOut = async () => {
    await signOut();
    redirectToSignIn(location.pathname);
  };

  return (
    <ToastProvider>
      <main className="expense-shell">
        <AppSidebar
          activeView={activeView}
          user={session.user}
          onSignOut={handleSignOut}
        />

        <section className="expense-main">
          <header className="expense-header">
            <div>
              <p className="eyebrow">ADMINISTRATION</p>
              <h1>{pageTitle}</h1>
            </div>
            <HealthBadge
              status={health?.status}
              indexedChunks={health?.indexedChunks}
              loading={health?.loading}
              error={health?.error}
              onRetry={checkHealth}
            />
          </header>

          <AdminDashboard
            key={activeView}
            defaultTab={defaultTab}
            health={health}
            onRefreshHealth={checkHealth}
          />
        </section>
      </main>
    </ToastProvider>
  );
}
