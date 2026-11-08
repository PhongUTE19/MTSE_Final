import { APP_ROUTES } from '../shared/constants/routes.js';
import { getUserRole } from '../shared/services/supabaseAuth.js';

/**
 * Workspace navigation items visible to all authenticated users.
 * Categories is intentionally not part of the sidebar.
 */
export const WORKSPACE_NAV_ITEMS = Object.freeze([
  Object.freeze({ key: 'transactions', label: 'Transactions', path: APP_ROUTES.EXPENSE_TRANSACTIONS, view: 'transactions' }),
  Object.freeze({ key: 'receipt', label: 'Scan Receipt', path: APP_ROUTES.EXPENSE_RECEIPTS, view: 'receipt' }),
]);

/**
 * Administration navigation items visible only to verified administrators.
 * Showing an item never grants access; the route guards still enforce the role.
 */
export const ADMIN_NAV_ITEMS = Object.freeze([
  Object.freeze({ key: 'knowledge', label: 'Knowledge Base', path: APP_ROUTES.ADMIN_KNOWLEDGE_BASE }),
  Object.freeze({ key: 'ai-usage', label: 'AI Usage', path: APP_ROUTES.ADMIN_AI_USAGE }),
]);

/**
 * Resolves visible navigation sections for a given user.
 * - Workspace: Transactions, Receipts (all authenticated users).
 * - Administration: Knowledge Base, AI Usage (verified administrators, in addition to Workspace).
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
 * Admin items are route-driven: they match only their own canonical path.
 *
 * @param {object} item - Admin navigation item.
 * @param {string} [currentPath=''] - Current browser pathname.
 * @returns {boolean}
 */
export function isAdminItemActive(item, currentPath = '') {
  return Boolean(item) && currentPath === item.path;
}

/**
 * Checks whether a Workspace navigation item is currently active.
 * Workspace items can only be active on the expense workspace route, so pages
 * such as /home or /admin/* highlight no Workspace item.
 *
 * @param {object} item - Workspace navigation item.
 * @param {string} [currentPath=''] - Current browser pathname.
 * @param {string} [activeView=''] - Current expense view ('transactions'|'receipt'|'categories').
 * @returns {boolean}
 */
export function isWorkspaceItemActive(item, currentPath = '', activeView = '') {
  if (!item) return false;
  if (currentPath === item.path || currentPath.startsWith(`${item.path}/`)) {
    return true;
  }
  if (currentPath === APP_ROUTES.EXPENSE) {
    return item.view === (activeView || 'transactions');
  }
  return false;
}
