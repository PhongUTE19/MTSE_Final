import React, { useCallback } from 'react';
import { appUrl, getPostAuthPath, getUserRole } from '../../shared/services/supabaseAuth';
import AuthenticatedRouteGuard from './AuthenticatedRouteGuard';

function redirectToRoleLanding(role) {
  window.location.replace(appUrl(getPostAuthPath(role)));
}

/**
 * Access control for administrator routes. Non-admins are sent to their appropriate
 * role landing route (e.g. /expense); renders `children({ user, onSignOut })` for verified admins only.
 */
export default function AdminRouteGuard({ children }) {
  const handleValidate = useCallback((currentSession) => {
    const role = getUserRole(currentSession);
    if (role !== 'admin') {
      redirectToRoleLanding(role);
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
