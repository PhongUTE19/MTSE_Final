import React from 'react';
import RoleRouteGuard from './RoleRouteGuard';

/**
 * Access control for administrator routes. Authenticated non-admins are redirected
 * to the shared home dashboard (/home); renders `children({ user, onSignOut })` for verified admins only.
 */
export default function AdminRouteGuard({ children }) {
  return (
    <RoleRouteGuard allowedRole="admin" loadingMessage="Checking administrator access…">
      {children}
    </RoleRouteGuard>
  );
}
