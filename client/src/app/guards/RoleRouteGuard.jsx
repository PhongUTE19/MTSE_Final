import React, { useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, getUserRole } from '../../shared/services/supabaseAuth';
import { useWorkspace } from '../providers/index.js';
import AuthenticatedRouteGuard from './AuthenticatedRouteGuard';

function redirectToHome() {
  window.location.replace(appUrl(APP_ROUTES.HOME));
}

/**
 * Reusable role-based route guard.
 * Enforces that the authenticated user has `allowedRole` from trusted `app_metadata.role`.
 * Authenticated users with a different role are redirected to `/home`;
 * unauthenticated guests are redirected to `/auth` via AuthenticatedRouteGuard.
 */
export default function RoleRouteGuard({
  allowedRole,
  loadingMessage = 'Checking access…',
  children,
}) {
  const workspace = useWorkspace();

  const handleValidate = useCallback(
    (currentSession) => {
      const role = getUserRole(currentSession);
      if (role !== allowedRole) {
        redirectToHome();
        return false;
      }
      return true;
    },
    [allowedRole]
  );

  if (workspace?.user) {
    const role = getUserRole(workspace.user);
    if (role !== allowedRole) {
      return <Navigate to={APP_ROUTES.HOME} replace />;
    }
    const authState = {
      user: workspace.user,
      onSignOut: workspace.onSignOut,
    };
    return typeof children === 'function' ? children(authState) : children;
  }

  return (
    <AuthenticatedRouteGuard
      loadingMessage={loadingMessage}
      onValidate={handleValidate}
    >
      {children}
    </AuthenticatedRouteGuard>
  );
}
