import React, { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, safeNextPath, signOut } from '../../shared/services/supabaseAuth';
import { useSession } from '../../shared/hooks';
import '../../layouts/workspaceLayout.css';

function redirectToSignIn(targetPath = (typeof window !== 'undefined' ? window.location?.pathname : '')) {
  const next = encodeURIComponent(safeNextPath(targetPath));
  window.location.replace(`${appUrl(APP_ROUTES.AUTH)}?next=${next}`);
}

/**
 * Access control for authenticated routes. Renders `children({ user, onSignOut })`
 * only once a session exists; page and layout composition stays with the caller.
 * Accepts optional `onValidate` (e.g. for role authorization) and `loadingMessage`.
 */
export default function AuthenticatedRouteGuard({
  children,
  loadingMessage = 'Checking your session…',
  onValidate,
}) {
  const location = useLocation();

  const handleUnauthorized = useCallback(() => {
    redirectToSignIn(location.pathname);
  }, [location.pathname]);

  const { session } = useSession({
    onValidate,
    onUnauthorized: handleUnauthorized,
  });

  if (!session) {
    return (
      <main className="expense-shell">
        <section className="expense-main">
          <p>{loadingMessage}</p>
        </section>
      </main>
    );
  }

  return children({
    user: session.user,
    onSignOut: async () => {
      await signOut();
      redirectToSignIn(location.pathname);
    },
  });
}
