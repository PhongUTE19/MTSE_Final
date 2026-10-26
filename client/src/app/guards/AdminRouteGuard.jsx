import React, { useCallback } from 'react';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, getUserRole } from '../../shared/services/supabaseAuth';
import AuthenticatedRouteGuard from './AuthenticatedRouteGuard';

function redirectToHome() {
  window.location.replace(appUrl(APP_ROUTES.HOME));
}

/**
 * Access control for administrator routes. Authenticated non-admins are redirected
 * to the shared home dashboard (/); renders `children({ user, onSignOut })` for verified admins only.
 */
export default function AdminRouteGuard({ children }) {
  const handleValidate = useCallback((currentSession) => {
    const role = getUserRole(currentSession);
    if (role !== 'admin') {
      redirectToHome();
      return false;
    }
    return true;
  }, []);

  return (
    <AuthenticatedRouteGuard
      loadingMessage="Checking administrator access…"
      onValidate={handleValidate}
    >
      {children}
    </AuthenticatedRouteGuard>
  );
}
