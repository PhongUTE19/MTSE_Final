import React from 'react';
import { PageHeader } from '../../layouts/WorkspaceLayout.jsx';
import { useWorkspace } from '../../app/providers/index.js';
import { getUserDisplayIdentity } from '../../shared/services/supabaseAuth.js';
import Card from '../../primitives/cards/Card.jsx';
import CardTitle from '../../primitives/cards/CardTitle.jsx';
import { Stack, Inline } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Shared Home Dashboard for SpendWise.
 * Serves as the primary landing page for authenticated Users and Admins,
 * displaying role-appropriate navigation cards and quick actions.
 */
export default function HomePage({ user }) {
  const { user: workspaceUser } = useWorkspace();
  const resolvedUser = user ?? workspaceUser;
  const { displayName, isAdmin } = getUserDisplayIdentity(resolvedUser);

  return (
    <Stack gap="xl">
      <PageHeader
        eyebrow="SPENDWISE"
        title="Dashboard"
        description="Overview of your personal finance workspace and quick navigation."
      />
      <Card as="section" variant="glass" padding="lg">
        <Inline justify="between" align="center" wrap gap="md">
          <Stack gap="xs">
            <CardTitle as="h2">Welcome back, {displayName}</CardTitle>
            <Text variant="secondary">
              {isAdmin
                ? 'Administrator control center: monitor AI operational telemetry and access personal finance tools.'
                : 'Track personal spending, scan receipts with multimodal AI, and keep your finances in balance.'}
            </Text>
          </Stack>
        </Inline>
      </Card>
    </Stack>
  );
}
