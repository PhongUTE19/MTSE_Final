import React, { useCallback } from 'react';
import ExpenseTrackerApp from './ExpenseTrackerApp';
import { APP_ROUTES } from '../../shared/constants';
import { appUrl, safeNextPath, signOut } from '../../shared/services/supabaseAuth';
import { useSession } from '../../shared/hooks';

function redirectToSignIn() {
  window.location.replace(`${appUrl(APP_ROUTES.AUTH)}?next=${encodeURIComponent(safeNextPath(window.location.pathname))}`);
}

export default function ExpenseSessionGate() {
  const handleUnauthorized = useCallback(() => {
    redirectToSignIn();
  }, []);

  const { session } = useSession({
    onUnauthorized: handleUnauthorized,
  });

  if (!session) {
    return (
      <main className="expense-shell">
        <section className="expense-main">
          <p>Checking your session…</p>
        </section>
      </main>
    );
  }

  return (
    <ExpenseTrackerApp
      user={session.user}
      onSignOut={async () => {
        await signOut();
        redirectToSignIn();
      }}
    />
  );
}
