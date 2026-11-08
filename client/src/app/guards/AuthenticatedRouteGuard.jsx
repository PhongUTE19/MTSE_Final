import React, { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, safeNextPath, signOut } from '../../shared/services/supabaseAuth';
import { useSession } from '../../shared/hooks';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import Text from '../../primitives/typography/Text.jsx';

function redirectToSignIn(targetPath = (typeof window !== 'undefined' ? window.location?.pathname : '')) {
  const next = encodeURIComponent(safeNextPath(targetPath));
  window.location.replace(`${appUrl(APP_ROUTES.AUTH)}?next=${next}`);
}

/**
 * Access control for authenticated routes. Renders `children({ user, onSignOut })`
 * (or standard React children) only once a session exists; page and layout composition
 * stays with the caller.
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
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6" role="status" aria-live="polite">
        <Spinner size="lg" variant="primary" label={loadingMessage} ariaHidden={false} />
        <Text variant="secondary">{loadingMessage}</Text>
      </div>
    );
  }

  const authState = {
    user: session.user,
    onSignOut: async () => {
      await signOut();
      redirectToSignIn(location.pathname);
    },
  };

  return typeof children === 'function' ? children(authState) : children;
}
