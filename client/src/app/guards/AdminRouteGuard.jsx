import React, { useCallback } from 'react';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, getUserRole } from '../../shared/services/supabaseAuth';
import { useWorkspace } from '../providers/index.js';
import AuthenticatedRouteGuard from './AuthenticatedRouteGuard';

function redirectToHome() {
  window.location.replace(appUrl(APP_ROUTES.HOME));
}

/**
 * Access control for administrator routes. Authenticated non-admins are redirected
 * to the shared home dashboard (/home); renders `children({ user, onSignOut })` for verified admins only.
 * If already inside an authenticated WorkspaceContext, evaluates immediately without redundant session polling.
 */
export default function AdminRouteGuard({ children }) {
  const workspace = useWorkspace();

  const handleValidate = useCallback((currentSession) => {
    const role = getUserRole(currentSession);
    if (role !== 'admin') {
      redirectToHome();
      return false;
    }
    return true;
  }, []);

  if (workspace?.user) {
    const role = getUserRole(workspace.user);
    if (role !== 'admin') {
      redirectToHome();
      return null;
    }
    const authState = {
      user: workspace.user,
      onSignOut: workspace.onSignOut,
    };
    return typeof children === 'function' ? children(authState) : children;
  }

  return (
    <AuthenticatedRouteGuard
      loadingMessage="Checking administrator access…"
      onValidate={handleValidate}
    >
      {children}
    </AuthenticatedRouteGuard>
  );
}
