import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../primitives/buttons/Button.jsx';
import { Inline, Stack } from '../primitives/layout/index.js';
import Avatar from '../primitives/display/Avatar.jsx';
import Text from '../primitives/typography/Text.jsx';
import OverflowText from '../primitives/typography/OverflowText.jsx';
import { APP_ROUTES } from '../shared/constants/routes.js';
import HealthBadge from '../composites/feedback/HealthBadge.jsx';
import {
  appUrl,
  getUserDisplayIdentity,
  safeNextPath,
  signOut,
} from '../shared/services/supabaseAuth.js';
import { useWorkspace } from '../app/providers/index.js';
import {
  getSidebarNavigation,
  isAdminItemActive,
  isWorkspaceItemActive,
} from './sidebarConfig.js';

/**
 * Semantic navigation link / action item within the sidebar.
 */
export function SidebarNavigationItem({ label, isActive, onClick }) {
  return (
    <Button
      type="button"
      variant={isActive ? 'sidebar-active' : 'sidebar'}
      fullWidth
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      data-active={isActive ? 'true' : undefined}
    >
      <OverflowText as="span" fullWidth title={label}>{label}</OverflowText>
    </Button>
  );
}

/**
 * Section eyebrow label for sidebar navigation groupings.
 */
export function SidebarSectionLabel({ children }) {
  return (
    <div className="mx-2 mt-3 mb-1 max-desktop:hidden">
      <Text variant="sidebar-eyebrow">{children}</Text>
    </div>
  );
}

/**
 * Navigation region container for sidebar groups.
 */
export function SidebarNavigation({ ariaLabel = 'Application navigation', children }) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-col gap-1.5 max-tablet:grid max-tablet:grid-cols-2 max-mobile:grid-cols-1 max-tablet:gap-2"
    >
      {children}
    </nav>
  );
}

/**
 * Sidebar footer user profile and logout control.
 */
export function SidebarUserSection({ userInitial, displayName, roleLabel, onSignOut }) {
  return (
    <footer className="border border-sidebar-border rounded-lg bg-sidebar-surface p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <Inline gap="sm" align="center">
          <Avatar size="md" variant="sidebar">{userInitial}</Avatar>
          <div className="min-w-0 flex flex-col gap-0.5 max-desktop:hidden max-tablet:hidden max-mobile:flex">
            <Text as="strong" size="xs" weight="semibold" color="sidebar" truncate>
              {displayName}
            </Text>
            <Text as="small" size="xs" color="sidebar-muted" truncate>
              {roleLabel}
            </Text>
          </div>
        </Inline>
      </div>
      <Button variant="sidebar-secondary" size="sm" fullWidth onClick={onSignOut}>
        Sign out
      </Button>
    </footer>
  );
}

/**
 * SpendWise Workspace Sidebar with stable two-tier navigation:
 * - Workspace: Transactions, Receipts (all authenticated users).
 * - Administration: Knowledge Base, AI Usage (verified administrators, shown in addition to Workspace).
 *
 * Navigation groups and items remain completely stable across all routes.
 * Visibility is cosmetic only; route guards enforce actual access.
 */
export function WorkspaceSidebar({
  activeView,
  onNavigate,
  user,
  onSignOut,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const workspaceCtx = useWorkspace();
  const { health, checkHealth } = workspaceCtx || {};
  const resolvedUser = user ?? workspaceCtx?.user;
  const resolvedOnSignOut = onSignOut ?? workspaceCtx?.onSignOut;

  const { displayName, userInitial, isAdmin, roleLabel } = getUserDisplayIdentity(resolvedUser);
  const { workspace, admin } = getSidebarNavigation(resolvedUser);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (resolvedOnSignOut) {
        await resolvedOnSignOut();
      } else {
        await signOut();
        window.location.replace(
          `${appUrl(APP_ROUTES.AUTH)}?next=${encodeURIComponent(safeNextPath(location.pathname))}`
        );
      }
    } catch {
      setSigningOut(false);
    }
  };

  const handleWorkspaceNavigation = (item) => {
    onNavigate?.(item.view);
    navigate(item.path);
  };

  const handleAdminNavigation = (item) => {
    onNavigate?.(item.key);
    navigate(item.path);
  };

  return (
    <aside className="fixed top-0 left-0 bottom-0 z-sidebar w-sidebar max-desktop:w-sidebar-compact bg-sidebar text-sidebar-fg p-5 px-4 max-desktop:p-4 max-desktop:px-2.5 border-r border-sidebar-border flex flex-col justify-between gap-4 overflow-y-auto max-tablet:static max-tablet:w-full max-tablet:border-r-0 max-tablet:border-b max-tablet:border-sidebar-border max-tablet:p-3.5 max-tablet:overflow-visible">
      <header className="flex flex-col gap-1 p-2 pb-3 border-b border-sidebar-border">
        <Inline gap="sm" align="center">
          <span className="inline-flex items-center justify-center w-fit px-2 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase text-brand-light bg-sidebar-active border border-sidebar-border">
            ◉
          </span>
          <Stack gap="2xs">
            <Text as="strong" variant="heading" weight="bold" color="sidebar">spendwise</Text>
            <div className="max-desktop:hidden">
              <Text as="small" size="xs" color="sidebar-muted">
                {isAdmin ? 'ADMIN WORKSPACE' : 'SMART EXPENSE TRACKER'}
              </Text>
            </div>
          </Stack>
        </Inline>
      </header>

      <SidebarNavigation ariaLabel="Application navigation">
        <SidebarNavigationItem
          label="Home"
          isActive={location.pathname === APP_ROUTES.HOME}
          onClick={() => navigate(APP_ROUTES.HOME)}
        />

        {workspace && workspace.length > 0 && (
          <>
            <SidebarSectionLabel>Workspace</SidebarSectionLabel>
            {workspace.map((item) => {
              const isActive = isWorkspaceItemActive(item, location.pathname, activeView);
              return (
                <SidebarNavigationItem
                  key={item.key}
                  label={item.label}
                  isActive={isActive}
                  onClick={() => handleWorkspaceNavigation(item)}
                />
              );
            })}
          </>
        )}

        {admin && (
          <>
            <SidebarSectionLabel>Administration</SidebarSectionLabel>
            {admin.map((item) => {
              const isActive = isAdminItemActive(item, location.pathname);
              return (
                <SidebarNavigationItem
                  key={item.key}
                  label={item.label}
                  isActive={isActive}
                  onClick={() => handleAdminNavigation(item)}
                />
              );
            })}
          </>
        )}
      </SidebarNavigation>

      <div className="mt-auto max-tablet:mt-0 flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1 max-desktop:justify-center">
          <HealthBadge
            loading={health?.loading}
            error={health?.error}
            onRetry={checkHealth}
          />
        </div>
        <SidebarUserSection
          userInitial={userInitial}
          displayName={displayName}
          roleLabel={roleLabel}
          onSignOut={handleSignOut}
        />
      </div>
    </aside>
  );
}

export default WorkspaceSidebar;
