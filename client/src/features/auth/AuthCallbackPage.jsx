import { useEffect, useState } from 'react';
import { APP_ROUTES } from '../../shared/constants';
import { AUTH_LABELS } from './authConstants';
import {
  appUrl,
  exchangeCodeForSessionFromUrl,
  formatAuthError,
  getPostAuthPath,
  getUserRole,
  isSupabaseConfigured,
  supabase,
} from '../../shared/services/supabaseAuth';
import Text from '../../primitives/typography/Text.jsx';
import Link from '../../primitives/typography/Link.jsx';
import Card from '../../primitives/cards/Card.jsx';
import CardTitle from '../../primitives/cards/CardTitle.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import AuthLayout from './AuthLayout';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Completing your secure sign-in…');

  useEffect(() => {
    async function complete() {
      if (!isSupabaseConfigured || !supabase) {
        setMessage(AUTH_LABELS.NOTICES.NOT_CONFIGURED_GENERIC);
        return;
      }
      const { session, error } = await exchangeCodeForSessionFromUrl();
      if (error) {
        setMessage(formatAuthError(error, 'callback'));
        return;
      }
      if (!session) {
        setMessage('We could not complete sign-in. Please return and try again.');
        return;
      }
      const role = getUserRole(session);
      const destination = getPostAuthPath(role, new URLSearchParams(window.location.search).get('next'));
      window.location.replace(appUrl(destination));
    }
    complete();
  }, []);

  return (
    <AuthLayout>
      <Card as="section" variant="glass" padding="xl" maxWidth="md" aria-live="polite">
        <Stack gap="md">
          <Text variant="kicker">SPENDWISE</Text>
          <CardTitle as="h1" size="xl">Finishing up</CardTitle>
          <Text variant="secondary">{message}</Text>
          <Text variant="secondary" align="center">
            <Link to={APP_ROUTES.AUTH}>
              Return to sign in
            </Link>
          </Text>
        </Stack>
      </Card>
    </AuthLayout>
  );
}
