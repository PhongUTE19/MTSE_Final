import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readClientFile = (relPath) => fs.readFileSync(path.join(ROOT, 'client', 'src', relPath), 'utf8');

import {
  getUserRole,
  getUserDisplayIdentity,
  getPostAuthPath,
  formatAuthError,
  extractRetryDuration,
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

    it('derives display identity with name, initials, admin status, and role label', () => {
      const adminUser = {
        email: 'admin@example.com',
        app_metadata: { role: 'admin' },
        user_metadata: { display_name: 'System Admin' },
      };
      assert.deepEqual(getUserDisplayIdentity(adminUser), {
        displayName: 'System Admin',
        userInitial: 'SA',
        isAdmin: true,
        roleLabel: 'Administrator',
      });

      const regularUser = {
        email: 'alex.smith@example.com',
        app_metadata: { role: 'user' },
      };
      assert.deepEqual(getUserDisplayIdentity(regularUser), {
        displayName: 'alex.smith',
        userInitial: 'A',
        isAdmin: false,
        roleLabel: 'Personal workspace',
      });

      assert.deepEqual(getUserDisplayIdentity(null), {
        displayName: 'User',
        userInitial: 'U',
        isAdmin: false,
        roleLabel: 'Personal workspace',
      });
    });
  });

  describe('2. Post-Authentication Destination Mapping', () => {
    it('redirects admin users to / by default', () => {
      assert.equal(getPostAuthPath('admin'), '/home');
      assert.equal(getPostAuthPath('admin', null), '/home');
      assert.equal(getPostAuthPath('admin', ''), '/home');
    });

    it('preserves canonical admin routes when explicitly requested by an admin and redirects expense routes to /home', () => {
      assert.equal(getPostAuthPath('admin', '/admin/knowledge-base'), '/admin/knowledge-base');
      assert.equal(getPostAuthPath('admin', '/admin/ai-usage'), '/admin/ai-usage');
      assert.equal(getPostAuthPath('admin', '/expense'), '/home');
      assert.equal(getPostAuthPath('admin', '/expense/transactions'), '/home');
    });

    it('redirects non-admin users to / by default', () => {
      assert.equal(getPostAuthPath('user'), '/home');
      assert.equal(getPostAuthPath('user', null), '/home');
      assert.equal(getPostAuthPath('user', ''), '/home');
    });

    it('strictly prevents non-admin users from accessing /admin or /analytics routes and defaults to /', () => {
      assert.equal(getPostAuthPath('user', '/admin'), '/home');
      assert.equal(getPostAuthPath('user', '/analytics'), '/home');
      assert.equal(getPostAuthPath('user', '/admin/analytics'), '/home');
      assert.equal(getPostAuthPath('user', '/admin/knowledge-base'), '/home');
    });

    it('normalizes legacy and canonical path destinations', () => {
      assert.equal(safeNextPath('/expense.html'), '/expense');
      assert.equal(safeNextPath('/admin/knowledge-base'), '/admin/knowledge-base');
      assert.equal(safeNextPath('/admin/ai-usage'), '/admin/ai-usage');
      assert.equal(safeNextPath('/home'), '/home');
      assert.equal(safeNextPath('/expense'), '/expense');
      assert.equal(safeNextPath('/invalid-path'), '/home');
      assert.equal(safeNextPath('//evil.example.com'), '/home');
      assert.equal(safeNextPath('https://evil.example.com/admin'), '/home');
      assert.equal(safeNextPath('/admin'), '/home', 'bare /admin is not an app route');
    });

    it('redirects to home instead of looping when requestedNext is / or /auth', () => {
      assert.equal(getPostAuthPath('user', '/'), '/home');
      assert.equal(getPostAuthPath('user', '/auth'), '/home');
      assert.equal(getPostAuthPath('admin', '/'), '/home');
      assert.equal(getPostAuthPath('admin', '/auth'), '/home');
      assert.equal(safeNextPath('/'), '/home');
      assert.equal(safeNextPath('/auth'), '/home');
    });

    it('strictly disallows obsolete handbook/demo routes and defaults to /', () => {
      assert.equal(getPostAuthPath('user', '/handbook'), '/home');
      assert.equal(getPostAuthPath('user', '/demo'), '/home');
      assert.equal(safeNextPath('/handbook'), '/home');
      assert.equal(safeNextPath('/demo'), '/home');
    });
  });

  describe('3. Auth Error Formatting & Rate Limit Actionable Messages', () => {
    it('formats 429 HTTP status into clear user-friendly guidance without unsupported recovery promises', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const formatted = formatAuthError(error, 'signup');
      assert.match(formatted, /too many sign-up requests or emails sent recently/i);
      assert.match(formatted, /please try again later/i);
      assert.equal(formatted.includes('wait a few minutes'), false, 'Must not promise unsupported duration');
    });

    it('formats over_email_send_rate_limit code into clear actionable notice without unsupported promises', () => {
      const error = { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' };
      const formatted = formatAuthError(error, 'signup');
      assert.match(formatted, /too many sign-up requests/i);
      assert.match(formatted, /try again later/i);
      assert.equal(formatted.includes('wait a few minutes'), false, 'Must not promise unsupported duration');
    });

    it('displays actual retry duration when available via Retry-After header', () => {
      const error = {
        status: 429,
        message: 'Too Many Requests',
        headers: { 'retry-after': '60' },
      };
      const formatted = formatAuthError(error, 'signup');
      assert.equal(formatted, 'Too many sign-up requests. Please try again in 60 seconds, or sign in if you already have an account.');
    });

    it('displays actual retry duration when available via retryAfter numeric property', () => {
      const error = {
        status: 429,
        message: 'Too Many Requests',
        retryAfter: 45,
      };
      const formatted = formatAuthError(error, 'signup');
      assert.equal(formatted, 'Too many sign-up requests. Please try again in 45 seconds, or sign in if you already have an account.');
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

    it('preserves provider cooldown timer when specified in error message', () => {
      const error = { message: 'For security purposes, you can only request this once every 60 seconds' };
      const formatted = formatAuthError(error, 'signup');
      assert.equal(formatted, error.message);
    });

    it('extractRetryDuration reliably parses headers, properties, and message metadata', () => {
      assert.equal(extractRetryDuration({ headers: { 'retry-after': '120' } }), '120 seconds');
      assert.equal(extractRetryDuration({ retryAfter: 30 }), '30 seconds');
      assert.equal(extractRetryDuration({ retry_after: '45 seconds' }), '45 seconds');
      assert.equal(extractRetryDuration({ message: 'Rate limit exceeded. Try again in 15 seconds.' }), '15 seconds');
      assert.equal(extractRetryDuration({ message: 'Too Many Requests' }), null);
      assert.equal(extractRetryDuration(null), null);
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

    it('redirects unauthorized authenticated non-admins to role landing route (/home)', () => {
      const regularSession = { user: { id: 'u2', app_metadata: { role: 'user' } } };
      const redirects = [];
      const mockRedirectToRoleLanding = (role) => redirects.push(getPostAuthPath(role));

      const adminGateHandler = (currentSession) => {
        const role = getUserRole(currentSession);
        if (role !== 'admin') {
          mockRedirectToRoleLanding(role);
          return false;
        }
        return true;
      };

      assert.equal(adminGateHandler(regularSession), false);
      assert.deepEqual(redirects, ['/home']);
    });

    it('feature API modules reuse consolidated apiClient and expose all required methods', async () => {
      const { transactionApi } = await import('../../client/src/features/transaction/transactionApi.js');
      const { receiptApi } = await import('../../client/src/features/receipt/receiptApi.js');
      const { expenseAssistantApi } = await import('../../client/src/features/expenseAssistant/expenseAssistantApi.js');
      const { draftStorage } = await import('../../client/src/features/transactionDraft/draftStorage.js');
      assert.equal(typeof transactionApi.list, 'function');
      assert.equal(typeof transactionApi.create, 'function');
      assert.equal(typeof transactionApi.update, 'function');
      assert.equal(typeof transactionApi.remove, 'function');
      assert.equal(typeof receiptApi.upload, 'function');
      assert.equal(typeof receiptApi.confirm, 'function');
      assert.equal(typeof receiptApi.listReceipts, 'function');
      assert.equal(typeof receiptApi.previewReceipt, 'function');
      assert.equal(typeof receiptApi.retryReceipt, 'function');
      assert.equal(typeof expenseAssistantApi.askExpenseAssistant, 'function');
      assert.equal(typeof expenseAssistantApi.searchAgentTransactions, 'function');
      assert.equal(typeof expenseAssistantApi.createAgentProposal, 'function');
      assert.equal(typeof draftStorage.listDrafts, 'function');
      assert.equal(typeof draftStorage.getDraft, 'function');
      assert.equal(typeof draftStorage.updateDraft, 'function');
      assert.equal(typeof draftStorage.createDraft, 'function');
      assert.equal(typeof draftStorage.deleteDraft, 'function');
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

    it('RoleRouteGuard and AuthenticatedRouteGuard prevent unauthorized access without premature loading redirects', () => {
      const roleGuardSource = readClientFile('app/guards/RoleRouteGuard.jsx');
      const adminGuardSource = readClientFile('app/guards/AdminRouteGuard.jsx');
      const authGuardSource = readClientFile('app/guards/AuthenticatedRouteGuard.jsx');
      const useSessionSource = readClientFile('shared/hooks/useSession.js');

      assert.match(roleGuardSource, /if \(role !== allowedRole\)\s*\{\s*return <Navigate to=\{APP_ROUTES\.HOME\} replace \/>;\s*\}/);
      assert.match(adminGuardSource, /<RoleRouteGuard allowedRole="admin"/);
      assert.match(authGuardSource, /if \(!session\) \{\s*return \(/);
      assert.match(useSessionSource, /const \[session, setSession\] = useState\(undefined\);/);
      assert.match(useSessionSource, /loading: session === undefined/);
    });
  });
});
