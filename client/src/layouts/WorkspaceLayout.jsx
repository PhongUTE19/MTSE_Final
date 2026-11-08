import React, { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import CardTitle from '../primitives/cards/CardTitle.jsx';
import Inline from '../primitives/layout/Inline.jsx';
import Stack from '../primitives/layout/Stack.jsx';
import Text from '../primitives/typography/Text.jsx';
import { useHealth } from '../shared/hooks/useHealth.js';
import { WorkspaceProvider } from '../app/providers/index.js';

/**
 * Main scrollable column of the Workspace layout.
 */
export function WorkspaceMain({ children }) {
  return (
    <section className="min-w-0 min-h-dvh p-6 max-tablet:p-3.5 max-tablet:min-h-0 max-tablet:flex-1">
      {children}
    </section>
  );
}

/**
 * Top header of the Workspace main view with title.
 */
export function WorkspaceHeader({ eyebrow, title, description, status }) {
  return (
    <header className="w-full">
      <Inline justify="between" align="start" gap="md" wrap fullWidth>
        <Stack gap="2xs">
          {eyebrow && <Text variant="eyebrow">{eyebrow}</Text>}
          {title && <CardTitle as="h1">{title}</CardTitle>}
          {description && <Text variant="secondary">{description}</Text>}
        </Stack>
        {(status) && (
          <Inline gap="sm" align="center" wrap>
            {status}
          </Inline>
        )}
      </Inline>
    </header>
  );
}

export { WorkspaceHeader as PageHeader };

/**
 * Content container inside the Workspace main column.
 */
export function WorkspaceContent({ children }) {
  return <div className="max-w-workspace mx-auto w-full min-w-0">{children}</div>;
}

/**
 * Shared workspace shell: sidebar + main column + overlays.
 *
 * @param {object} props
 * @param {object} [props.user]
 * @param {Function} [props.onSignOut]
 * @param {Function} [props.onHealthError] - Callback invoked when backend health state transitions to error
 * @param {React.ReactNode} [props.overlays]
 * @param {React.ReactNode} [props.children]
 */
export default function WorkspaceLayout({
  user,
  onSignOut,
  onHealthError,
  overlays,
  children,
}) {
  const { health, checkHealth } = useHealth();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const prevHealthErrorRef = useRef(false);

  useEffect(() => {
    const hasError = Boolean(health?.error);
    if (hasError && !prevHealthErrorRef.current) {
      onHealthError?.(health.error);
    }
    prevHealthErrorRef.current = hasError;
  }, [health?.error, onHealthError]);

  const shellClass = `min-h-dvh pl-sidebar max-desktop:pl-sidebar-compact max-tablet:pl-0 max-tablet:flex max-tablet:flex-col transition-padding-right duration-200 ease-out ${
    assistantOpen ? 'pr-push-drawer max-tablet:pr-0' : ''
  }`.trim();

  return (
    <WorkspaceProvider
      user={user}
      onSignOut={onSignOut}
      health={health}
      checkHealth={checkHealth}
      assistantOpen={assistantOpen}
      setAssistantOpen={setAssistantOpen}
    >
      <main className={shellClass}>
        <WorkspaceSidebar />

        <WorkspaceMain>
          <WorkspaceContent>{children ?? <Outlet />}</WorkspaceContent>
        </WorkspaceMain>

        {overlays}
      </main>
    </WorkspaceProvider>
  );
}
