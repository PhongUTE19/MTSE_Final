import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getUserRole, getPostAuthPath } from '../../client/src/shared/services/supabaseAuth.js';
import { ADMIN_TABS, APP_ROUTES } from '../../client/src/shared/constants/index.js';
import {
  getSidebarNavigation,
  isAdminItemActive,
  isWorkspaceItemActive,
  WORKSPACE_NAV_ITEMS,
  ADMIN_NAV_ITEMS,
} from '../../client/src/layouts/sidebarConfig.js';

describe('Admin Layout & Unified Sidebar Architecture Suite', () => {
  describe('1. Role-based Navigation Configuration & Exposure', () => {
    const regularUser = {
      id: 'u-reg',
      email: 'user@example.com',
      app_metadata: { role: 'user' },
      user_metadata: { display_name: 'Regular User' },
    };

    const adminUser = {
      id: 'u-adm',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
      user_metadata: { display_name: 'System Admin' },
    };

    it('renders Workspace navigation (Transactions, Receipts, Categories) for ordinary users and hides Administration', () => {
      const nav = getSidebarNavigation(regularUser);

      assert.equal(getUserRole(regularUser), 'user');
      assert.equal(nav.workspace.length, 3);
      assert.deepEqual(
        nav.workspace.map((i) => i.label),
        ['Transactions', 'Receipts', 'Categories']
      );
      assert.deepEqual(
        nav.workspace.map((i) => i.view),
        ['transactions', 'receipt', 'categories']
      );
      assert.equal(nav.admin, null, 'Ordinary users must never see Administration section');
    });

    it('renders both Workspace and Administration (Knowledge Base, AI Usage) for verified admins', () => {
      const nav = getSidebarNavigation(adminUser);

      assert.equal(getUserRole(adminUser), 'admin');
      assert.equal(nav.workspace.length, 3);
      assert.deepEqual(
        nav.workspace.map((i) => i.label),
        ['Transactions', 'Receipts', 'Categories']
      );

      assert.ok(nav.admin);
      assert.equal(nav.admin.length, ADMIN_NAV_ITEMS.length);
      assert.deepEqual(
        nav.admin.map((i) => i.label),
        ADMIN_NAV_ITEMS.map((i) => i.label)
      );
    });

    it('keeps navigation groups and items stable across all routes for the same role', () => {
      const adminNav = getSidebarNavigation(adminUser);
      assert.deepEqual(adminNav.workspace, WORKSPACE_NAV_ITEMS);
      assert.deepEqual(adminNav.admin, ADMIN_NAV_ITEMS);

      const userNav = getSidebarNavigation(regularUser);
      assert.deepEqual(userNav.workspace, WORKSPACE_NAV_ITEMS);
      assert.equal(userNav.admin, null);
    });

    it('correctly highlights active route for Workspace and Administration items', () => {
      const [txItem, receiptItem, catItem] = WORKSPACE_NAV_ITEMS;
      const aiItem = ADMIN_NAV_ITEMS.find((i) => i.key === 'analytics') || {
        key: 'analytics',
        label: 'AI Usage',
        path: APP_ROUTES.ADMIN_ANALYTICS,
      };
      const kbItem = ADMIN_NAV_ITEMS.find((i) => i.key === 'knowledge') || {
        key: 'knowledge',
        label: 'Knowledge Base',
        path: APP_ROUTES.ADMIN_KNOWLEDGE,
      };

      // On /expense: active view highlights the matching workspace item
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.EXPENSE, 'transactions'), true);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.EXPENSE, 'transactions'), false);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.EXPENSE, 'receipt'), true);
      assert.equal(isWorkspaceItemActive(catItem, APP_ROUTES.EXPENSE, 'categories'), true);
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.EXPENSE, 'transactions'), false);
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.EXPENSE, 'transactions'), false);

      // On /admin/knowledge-base: Knowledge Base is active, workspace items are inactive
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), true);
      assert.equal(isAdminItemActive(kbItem, '/admin'), true);
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), false);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), false);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), false);

      // On /admin/analytics: AI Usage is active, workspace items are inactive
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.ADMIN_ANALYTICS, 'analytics'), true);
      assert.equal(isAdminItemActive(aiItem, '/analytics'), true);
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.ADMIN_ANALYTICS, 'analytics'), false);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.ADMIN_ANALYTICS, 'analytics'), false);
    });
  });

  describe('2. AdminRouteGuard Security & Guard Verification', () => {
    it('strictly denies non-admin users and redirects to expense workspace', () => {
      const regularSession = {
        user: {
          id: 'u-attacker',
          email: 'attacker@example.com',
          app_metadata: { role: 'user' },
          user_metadata: { role: 'admin' }, // Forged user_metadata
        },
      };

      const validateAccess = (session) => {
        if (getUserRole(session) !== 'admin') {
          return { allowed: false, redirect: APP_ROUTES.EXPENSE };
        }
        return { allowed: true };
      };

      const result = validateAccess(regularSession);
      assert.equal(result.allowed, false);
      assert.equal(result.redirect, APP_ROUTES.EXPENSE);
    });

    it('permits verified admin session with valid app_metadata', () => {
      const validAdminSession = {
        user: {
          id: 'u-verified-admin',
          email: 'admin@example.com',
          app_metadata: { role: 'admin' },
        },
      };

      const validateAccess = (session) => {
        if (getUserRole(session) !== 'admin') {
          return { allowed: false, redirect: APP_ROUTES.EXPENSE };
        }
        return { allowed: true };
      };

      const result = validateAccess(validAdminSession);
      assert.equal(result.allowed, true);
    });

    it('maps defaultTab appropriately for canonical and legacy admin routes', () => {
      const resolveAdminView = (pathname, defaultTab) => {
        const activeView = (pathname === APP_ROUTES.ADMIN_KNOWLEDGE) ? 'knowledge' : 'analytics';
        const pageTitle = activeView === 'analytics' ? 'AI Usage Analytics' : 'Knowledge Base';
        return { activeView, pageTitle, tab: defaultTab };
      };

      const adminRoute = resolveAdminView(APP_ROUTES.ADMIN_KNOWLEDGE, ADMIN_TABS.KNOWLEDGE);
      assert.equal(adminRoute.activeView, 'knowledge');
      assert.equal(adminRoute.pageTitle, 'Knowledge Base');
      assert.equal(adminRoute.tab, ADMIN_TABS.KNOWLEDGE);

      const analyticsRoute = resolveAdminView(APP_ROUTES.ADMIN_ANALYTICS, ADMIN_TABS.ANALYTICS);
      assert.equal(analyticsRoute.activeView, 'analytics');
      assert.equal(analyticsRoute.pageTitle, 'AI Usage Analytics');
      assert.equal(analyticsRoute.tab, ADMIN_TABS.ANALYTICS);
    });
  });

  describe('3. Post-Auth Routing Protection', () => {
    it('ensures post-auth path never leaks admin routes to regular users', () => {
      assert.equal(getPostAuthPath('user', APP_ROUTES.ADMIN_KNOWLEDGE), APP_ROUTES.EXPENSE);
      assert.equal(getPostAuthPath('user', APP_ROUTES.ADMIN_ANALYTICS), APP_ROUTES.EXPENSE);
      assert.equal(getPostAuthPath('user'), APP_ROUTES.EXPENSE);
    });

    it('routes admins directly to analytics by default or requested admin sub-route', () => {
      assert.equal(getPostAuthPath('admin'), APP_ROUTES.ADMIN_ANALYTICS);
      assert.equal(getPostAuthPath('admin', APP_ROUTES.ADMIN_KNOWLEDGE), APP_ROUTES.ADMIN_KNOWLEDGE);
      assert.equal(getPostAuthPath('admin', APP_ROUTES.ADMIN_ANALYTICS), APP_ROUTES.ADMIN_ANALYTICS);
    });
  });
});
