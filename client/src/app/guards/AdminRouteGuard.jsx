import React, { useCallback } from 'react';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, getUserRole } from '../../shared/services/supabaseAuth';
import AuthenticatedRouteGuard from './AuthenticatedRouteGuard';

function redirectToExpense() {
  window.location.replace(appUrl(APP_ROUTES.EXPENSE));
}

/**
 * Access control for administrator routes. Non-admins are sent to the expense
 * workspace; renders `children({ user, onSignOut })` for verified admins only.
 */
export default function AdminRouteGuard({ children }) {
  const handleValidate = useCallback((currentSession) => {
    if (getUserRole(currentSession) !== 'admin') {
      redirectToExpense();
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
