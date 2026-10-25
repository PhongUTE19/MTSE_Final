import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserRole } from '../shared/services/supabaseAuth';
import {
  getSidebarNavigation,
  isAdminItemActive,
  isWorkspaceItemActive,
} from './sidebarConfig';

/**
 * SpendWise application sidebar with stable two-tier navigation:
 * - Workspace: Transactions, Receipts, Categories (all authenticated users).
 * - Administration: Knowledge Base, AI Usage (verified administrators only).
 *
 * Navigation groups and items remain completely stable across all routes.
 */
export default function AppSidebar({
  activeView,
  onNavigate,
  user,
  onSignOut,
  currentWorkspace,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = getUserRole(user) === 'admin';
  const { workspace, admin } = getSidebarNavigation(user);

  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Account';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const handleWorkspaceNavigation = (item) => {
    onNavigate?.(item.view);
    if (location.pathname !== item.path) {
      navigate(item.path, { state: { view: item.view } });
    }
  };

  const handleAdminNavigation = (item) => {
    onNavigate?.(item.key);
    navigate(item.path);
  };

  return (
    <aside className="expense-sidebar">
      <div className="brand">
        <span className="brand-mark">◉</span>
        <div>
          <strong>spendwise</strong>
          <small>{isAdmin ? 'ADMIN WORKSPACE' : 'SMART EXPENSE TRACKER'}</small>
        </div>
      </div>

      <nav aria-label="Application navigation">
        <p className="sidebar-section-label">Workspace</p>
        {workspace.map((item) => {
          const isActive = isWorkspaceItemActive(item, location.pathname, activeView);
          return (
            <button
              type="button"
              key={item.key}
              className={isActive ? 'active' : ''}
              onClick={() => handleWorkspaceNavigation(item)}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </button>
          );
        })}

        {admin && (
          <>
            <p className="sidebar-section-label sidebar-section-label--admin">Administration</p>
            {admin.map((item) => {
              const isActive = isAdminItemActive(item, location.pathname, activeView);
              return (
                <button
                  type="button"
                  key={item.key}
                  className={isActive ? 'active' : ''}
                  onClick={() => handleAdminNavigation(item)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <span>{initials}</span>
        <div>
          <strong>{displayName}</strong>
          <small>{isAdmin ? 'Administrator' : 'Personal workspace'}</small>
        </div>
        <button type="button" className="sidebar-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
