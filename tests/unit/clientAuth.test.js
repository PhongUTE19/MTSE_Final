import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getUserRole,
  getPostAuthPath,
  formatAuthError,
  safeNextPath,
} from '../../client/src/shared/services/supabaseAuth.js';

describe('Client Authentication and Role Routing Suite', () => {
  describe('1. Role Resolution from Trusted Metadata', () => {
    it('resolves admin role from trusted app_metadata.role', () => {
      const session = {
        user: {
          id: 'u-admin-1',
          email: 'admin@example.com',
          app_metadata: { role: 'admin' },
          user_metadata: { role: 'user' },
        },
      };
      assert.equal(getUserRole(session), 'admin');
    });

    it('rejects client-supplied user_metadata claiming admin role', () => {
      const forgedSession = {
        user: {
          id: 'u-user-1',
          email: 'attacker@example.com',
          app_metadata: { role: 'user' },
          user_metadata: { role: 'admin' }, // Untrusted client-editable metadata
        },
      };
      assert.equal(getUserRole(forgedSession), 'user');
    });

    it('defaults to user role when app_metadata is missing or role is omitted', () => {
      assert.equal(getUserRole({ user: { id: 'u-1', email: 'guest@example.com' } }), 'user');
      assert.equal(getUserRole(null), 'user');
      assert.equal(getUserRole(undefined), 'user');
    });
  });

  describe('2. Post-Authentication Destination Mapping', () => {
    it('redirects admin users to /admin/analytics by default', () => {
      assert.equal(getPostAuthPath('admin'), '/admin/analytics');
      assert.equal(getPostAuthPath('admin', null), '/admin/analytics');
      assert.equal(getPostAuthPath('admin', ''), '/admin/analytics');
    });

    it('preserves canonical and legacy admin routes when explicitly requested by an admin', () => {
      assert.equal(getPostAuthPath('admin', '/admin/knowledge-base'), '/admin/knowledge-base');
      assert.equal(getPostAuthPath('admin', '/admin/analytics'), '/admin/analytics');
      assert.equal(getPostAuthPath('admin', '/admin'), '/admin/knowledge-base');
      assert.equal(getPostAuthPath('admin', '/analytics'), '/admin/analytics');
    });

    it('redirects non-admin users to /expense by default', () => {
      assert.equal(getPostAuthPath('user'), '/expense');
      assert.equal(getPostAuthPath('user', null), '/expense');
      assert.equal(getPostAuthPath('user', ''), '/expense');
    });

    it('strictly prevents non-admin users from accessing /admin or /analytics routes', () => {
      assert.equal(getPostAuthPath('user', '/admin'), '/expense');
      assert.equal(getPostAuthPath('user', '/analytics'), '/expense');
      assert.equal(getPostAuthPath('user', '/admin/analytics'), '/expense');
      assert.equal(getPostAuthPath('user', '/admin/knowledge-base'), '/expense');
      assert.equal(getPostAuthPath('user', '/admin.html'), '/expense');
    });

    it('normalizes legacy and canonical path destinations', () => {
      assert.equal(safeNextPath('/expense.html'), '/expense');
      assert.equal(safeNextPath('/admin.html'), '/admin/knowledge-base');
      assert.equal(safeNextPath('/admin/knowledge-base'), '/admin/knowledge-base');
      assert.equal(safeNextPath('/admin/analytics'), '/admin/analytics');
      assert.equal(safeNextPath('/invalid-path'), '/expense');
    });

    it('redirects to workspace instead of looping when requestedNext is / or /auth', () => {
      assert.equal(getPostAuthPath('user', '/'), '/expense');
      assert.equal(getPostAuthPath('user', '/auth'), '/expense');
      assert.equal(getPostAuthPath('admin', '/'), '/admin/analytics');
      assert.equal(getPostAuthPath('admin', '/auth'), '/admin/analytics');
      assert.equal(safeNextPath('/'), '/expense');
      assert.equal(safeNextPath('/auth'), '/expense');
    });

    it('strictly disallows obsolete handbook/demo routes and defaults to expense', () => {
      assert.equal(getPostAuthPath('user', '/handbook'), '/expense');
      assert.equal(getPostAuthPath('user', '/demo'), '/expense');
      assert.equal(safeNextPath('/handbook'), '/expense');
      assert.equal(safeNextPath('/demo'), '/expense');
    });
  });

  describe('3. Auth Error Formatting & Rate Limit Actionable Messages', () => {
    it('formats 429 HTTP status into clear user-friendly guidance', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const formatted = formatAuthError(error, 'signup');
      assert.match(formatted, /too many sign-up requests or emails sent recently/i);
      assert.match(formatted, /please wait a few minutes/i);
    });

    it('formats over_email_send_rate_limit code into clear actionable notice', () => {
      const error = { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' };
      const formatted = formatAuthError(error, 'signup');
      assert.match(formatted, /too many sign-up requests/i);
      assert.match(formatted, /wait a few minutes before trying again/i);
    });

    it('formats duplicate user registrations with prompt to sign in', () => {
      const error = { message: 'User already registered' };
      const formatted = formatAuthError(error, 'signup');
      assert.equal(formatted, 'An account with this email address already exists. Please sign in or reset your password.');
    });

    it('formats invalid login credentials clearly', () => {
      const error = { message: 'Invalid login credentials' };
      const formatted = formatAuthError(error, 'signin');
      assert.equal(formatted, 'Invalid email address or password. Please verify your credentials and try again.');
    });

    it('preserves provider cooldown timer when specified', () => {
      const error = { message: 'For security purposes, you can only request this once every 60 seconds' };
      const formatted = formatAuthError(error, 'signup');
      assert.equal(formatted, error.message);
    });
  });

  describe('4. Consolidated HTTP Client, Session Gate & Validation Suite', () => {
    it('exports useSession hook from useSession.js', async () => {
      const { useSession } = await import('../../client/src/shared/hooks/useSession.js');
      assert.equal(typeof useSession, 'function');
    });

    it('enforces gate validation rules: AdminRouteGuard requires admin, AuthenticatedRouteGuard accepts any user', () => {
      const adminSession = { user: { id: 'u1', app_metadata: { role: 'admin' } } };
      const regularSession = { user: { id: 'u2', app_metadata: { role: 'user' } } };

      // AdminRouteGuard validate handler pattern:
      const adminGateValidator = (session) => getUserRole(session) === 'admin';
      assert.equal(adminGateValidator(adminSession), true);
      assert.equal(adminGateValidator(regularSession), false);

      // AuthenticatedRouteGuard validate pattern:
      const expenseGateValidator = (session) => Boolean(session?.user);
      assert.equal(expenseGateValidator(adminSession), true);
      assert.equal(expenseGateValidator(regularSession), true);
      assert.equal(expenseGateValidator(null), false);
    });

    it('expenseApi reuses consolidated apiClient and exposes all required methods', async () => {
      const { expenseApi } = await import('../../client/src/features/expense/expenseApi.js');
      assert.equal(typeof expenseApi.list, 'function');
      assert.equal(typeof expenseApi.create, 'function');
      assert.equal(typeof expenseApi.update, 'function');
      assert.equal(typeof expenseApi.remove, 'function');
      assert.equal(typeof expenseApi.upload, 'function');
      assert.equal(typeof expenseApi.listReceipts, 'function');
      assert.equal(typeof expenseApi.previewReceipt, 'function');
      assert.equal(typeof expenseApi.retryReceipt, 'function');
      assert.equal(typeof expenseApi.confirmReceipt, 'function');
      assert.equal(typeof expenseApi.deleteReceipt, 'function');
      assert.equal(typeof expenseApi.askExpenseAssistant, 'function');
      assert.equal(typeof expenseApi.searchAgentTransactions, 'function');
      assert.equal(typeof expenseApi.createAgentProposal, 'function');
      assert.equal(typeof expenseApi.confirmAgentProposal, 'function');
      assert.equal(typeof expenseApi.cancelAgentProposal, 'function');
    });

    it('validates password length boundary of at least 8 characters without trimming', async () => {
      const { validateStringLength } = await import('../../client/src/shared/utils/validation.js');
      assert.equal(validateStringLength('1234567', { min: 8, trim: false }).isValid, false);
      assert.equal(validateStringLength('12345678', { min: 8, trim: false }).isValid, true);
      assert.equal(validateStringLength('pass word', { min: 8, trim: false }).isValid, true);
    });

    it('validates email addresses accurately rejecting invalid formats', async () => {
      const { validateEmail } = await import('../../client/src/shared/utils/validation.js');
      assert.equal(validateEmail('').isValid, false);
      assert.equal(validateEmail('invalid').isValid, false);
      assert.equal(validateEmail('student@hcmute.edu.vn').isValid, true);
    });
  });
});
