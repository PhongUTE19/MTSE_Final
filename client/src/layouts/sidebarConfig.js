import { APP_ROUTES } from '../shared/constants/routes.js';
import { getUserRole } from '../shared/services/supabaseAuth.js';

/**
 * Workspace navigation items visible to all authenticated users.
 */
export const WORKSPACE_NAV_ITEMS = Object.freeze([
  Object.freeze({ key: 'transactions', label: 'Transactions', path: APP_ROUTES.EXPENSE, view: 'transactions' }),
  Object.freeze({ key: 'receipt', label: 'Receipts', path: APP_ROUTES.EXPENSE, view: 'receipt' }),
  Object.freeze({ key: 'categories', label: 'Categories', path: APP_ROUTES.EXPENSE, view: 'categories' }),
]);

/**
 * Administration navigation items visible only to verified administrators.
 */
export const ADMIN_NAV_ITEMS = Object.freeze([
  Object.freeze({ key: 'knowledge', label: 'Knowledge Base', path: APP_ROUTES.ADMIN_KNOWLEDGE }),
  Object.freeze({ key: 'analytics', label: 'AI Usage', path: APP_ROUTES.ADMIN_ANALYTICS }),
]);

/**
 * Resolves visible navigation sections for a given user.
 * - Workspace: Transactions, Receipts, Categories (all authenticated users).
 * - Administration: Knowledge Base, AI Usage (verified administrators only).
 *
 * @param {object} user - Authenticated Supabase user object or session.
 * @returns {{ workspace: typeof WORKSPACE_NAV_ITEMS, admin: typeof ADMIN_NAV_ITEMS | null }}
 */
export function getSidebarNavigation(user) {
  const isAdmin = getUserRole(user) === 'admin';
  return {
    workspace: WORKSPACE_NAV_ITEMS,
    admin: isAdmin ? ADMIN_NAV_ITEMS : null,
  };
}

/**
 * Checks whether an Administration navigation item is currently active.
 *
 * @param {object} item - Admin navigation item.
 * @param {string} [currentPath=''] - Current browser pathname.
 * @param {string} [activeView=''] - Explicit active view key if provided.
 * @returns {boolean}
 */
export function isAdminItemActive(item, currentPath = '', activeView = '') {
  if (activeView && activeView === item.key) return true;
  if (currentPath && currentPath === item.path) return true;
  if (
    item.path === APP_ROUTES.ADMIN_KNOWLEDGE &&
    (currentPath === '/admin' ||
      currentPath === '/admin/knowledge-base' ||
      activeView === 'knowledge')
  ) {
    return true;
  }
  if (
    item.path === APP_ROUTES.ADMIN_ANALYTICS &&
    (currentPath === '/analytics' ||
      currentPath === '/admin/analytics' ||
      activeView === 'analytics')
  ) {
    return true;
  }
  return false;
}

/**
 * Checks whether a Workspace navigation item is currently active.
 * Workspace items are active only when on the expense workspace route (not on an admin route).
 *
 * @param {object} item - Workspace navigation item.
 * @param {string} [currentPath=''] - Current browser pathname.
 * @param {string} [activeView=''] - Current active expense view ('transactions'|'receipt'|'categories').
 * @returns {boolean}
 */
export function isWorkspaceItemActive(item, currentPath = '', activeView = '') {
  const isAdminPath =
    currentPath === APP_ROUTES.ADMIN_ANALYTICS ||
    currentPath === APP_ROUTES.ADMIN_KNOWLEDGE ||
    currentPath === '/admin' ||
    currentPath === '/analytics' ||
    activeView === 'knowledge' ||
    activeView === 'analytics';

  if (isAdminPath) return false;

  const currentView = activeView || 'transactions';
  return item.view === currentView;
}
