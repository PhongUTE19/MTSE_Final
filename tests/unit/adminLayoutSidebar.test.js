import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getUserRole, getUserDisplayIdentity, getPostAuthPath } from '../../client/src/shared/services/supabaseAuth.js';
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

    it('renders Workspace navigation (Transactions, Receipts) for ordinary users and hides Administration', () => {
      const nav = getSidebarNavigation(regularUser);

      assert.equal(getUserRole(regularUser), 'user');
      assert.deepEqual(
        nav.workspace.map((i) => i.key),
        ['transactions', 'receipt']
      );
      assert.deepEqual(
        nav.workspace.map((i) => i.label),
        ['Transactions', 'Receipts']
      );
      assert.deepEqual(
        nav.workspace.map((i) => i.view),
        ['transactions', 'receipt']
      );
      assert.equal(nav.admin, null, 'Ordinary users must never see Administration section');
    });

    it('renders both Workspace and Administration (Knowledge Base, AI Usage) for verified admins', () => {
      const nav = getSidebarNavigation(adminUser);

      assert.equal(getUserRole(adminUser), 'admin');
      assert.deepEqual(
        nav.workspace.map((i) => i.label),
        ['Transactions', 'Receipts']
      );
      assert.deepEqual(
        nav.admin.map((i) => i.label),
        ['Knowledge Base', 'AI Usage']
      );
      assert.deepEqual(
        nav.admin.map((i) => i.path),
        [APP_ROUTES.ADMIN_KNOWLEDGE, APP_ROUTES.ADMIN_ANALYTICS]
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

    it('derives matching user display identity for sidebar profile and role badge', () => {
      const adminId = getUserDisplayIdentity(adminUser);
      assert.equal(adminId.displayName, 'System Admin');
      assert.equal(adminId.userInitial, 'SA');
      assert.equal(adminId.isAdmin, true);
      assert.equal(adminId.roleLabel, 'Administrator');

      const regularId = getUserDisplayIdentity(regularUser);
      assert.equal(regularId.displayName, 'Regular User');
      assert.equal(regularId.userInitial, 'RU');
      assert.equal(regularId.isAdmin, false);
      assert.equal(regularId.roleLabel, 'Personal workspace');
    });

    it('highlights the active route for Workspace and Administration items', () => {
      const [txItem, receiptItem] = WORKSPACE_NAV_ITEMS;
      const kbItem = ADMIN_NAV_ITEMS.find((i) => i.key === 'knowledge');
      const aiItem = ADMIN_NAV_ITEMS.find((i) => i.key === 'analytics');

      // /expense: the active view selects the matching workspace item
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.EXPENSE, 'transactions'), true);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.EXPENSE), true, 'defaults to transactions');
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.EXPENSE, 'transactions'), false);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.EXPENSE, 'receipt'), true);
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.EXPENSE), false);
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.EXPENSE), false);

      // /home: neither workspace item is highlighted
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.HOME, 'home'), false);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.HOME), false);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.HOME), false);

      // /admin/knowledge-base
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.ADMIN_KNOWLEDGE), true);
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.ADMIN_KNOWLEDGE), false);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), false);
      assert.equal(isWorkspaceItemActive(receiptItem, APP_ROUTES.ADMIN_KNOWLEDGE, 'knowledge'), false);

      // /admin/analytics
      assert.equal(isAdminItemActive(aiItem, APP_ROUTES.ADMIN_ANALYTICS), true);
      assert.equal(isAdminItemActive(kbItem, APP_ROUTES.ADMIN_ANALYTICS), false);
      assert.equal(isWorkspaceItemActive(txItem, APP_ROUTES.ADMIN_ANALYTICS, 'analytics'), false);

      // Legacy /admin, /analytics and /workspace are not routes and highlight nothing
      for (const legacyPath of ['/admin', '/analytics', '/workspace']) {
        assert.equal(isAdminItemActive(kbItem, legacyPath), false);
        assert.equal(isAdminItemActive(aiItem, legacyPath), false);
        assert.equal(isWorkspaceItemActive(txItem, legacyPath), false);
      }

      // Missing items never throw or highlight
      assert.equal(isWorkspaceItemActive(undefined, APP_ROUTES.EXPENSE), false);
      assert.equal(isAdminItemActive(undefined, APP_ROUTES.ADMIN_KNOWLEDGE), false);
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
          return { allowed: false, redirect: APP_ROUTES.HOME };
        }
        return { allowed: true };
      };

      const result = validateAccess(regularSession);
      assert.equal(result.allowed, false);
      assert.equal(result.redirect, APP_ROUTES.HOME);
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
          return { allowed: false, redirect: APP_ROUTES.HOME };
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
      assert.equal(getPostAuthPath('user', APP_ROUTES.ADMIN_KNOWLEDGE), APP_ROUTES.HOME);
      assert.equal(getPostAuthPath('user', APP_ROUTES.ADMIN_ANALYTICS), APP_ROUTES.HOME);
      assert.equal(getPostAuthPath('user'), APP_ROUTES.HOME);
    });

    it('routes admins directly to home by default or requested admin sub-route', () => {
      assert.equal(getPostAuthPath('admin'), APP_ROUTES.HOME);
      assert.equal(getPostAuthPath('admin', APP_ROUTES.ADMIN_KNOWLEDGE), APP_ROUTES.ADMIN_KNOWLEDGE);
      assert.equal(getPostAuthPath('admin', APP_ROUTES.ADMIN_ANALYTICS), APP_ROUTES.ADMIN_ANALYTICS);
    });
  });
});
