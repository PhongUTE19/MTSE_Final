import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyAccessToken,
  toVerifiedIdentity,
  setUserRole,
  setTokenVerifierForTests,
  getTokenVerifier,
} from '../../server/src/features/auth/auth.service.js';
import { userRoleSchema } from '../../server/src/features/auth/auth.schemas.js';
import { AppError } from '../../server/src/shared/errors/index.js';

describe('Auth Service and Role Management Suite', () => {
  describe('1. Identity Normalization and Verification', () => {
    it('toVerifiedIdentity enforces app_metadata.role=admin only when explicitly set in app_metadata', () => {
      const regularUser = {
        id: 'u-1',
        email: 'user@example.com',
        app_metadata: {},
        user_metadata: { role: 'admin' }, // Untrusted user_metadata attempt
      };

      const identity = toVerifiedIdentity(regularUser, 'token-123');
      assert.equal(identity.id, 'u-1');
      assert.equal(identity.email, 'user@example.com');
      assert.equal(identity.role, 'user', 'Must ignore untrusted user_metadata and default to user');
      assert.equal(identity.token, 'token-123');
    });

    it('toVerifiedIdentity assigns admin role when app_metadata.role is admin', () => {
      const adminUser = {
        id: 'u-admin',
        email: 'admin@example.com',
        app_metadata: { role: 'admin' },
      };

      const identity = toVerifiedIdentity(adminUser, 'token-456');
      assert.equal(identity.role, 'admin');
    });

    it('verifyAccessToken delegates to test seam when registered', async () => {
      setTokenVerifierForTests(async (t) => ({ id: 'mocked-id', token: t, app_metadata: { role: 'user' } }));
      assert.equal(typeof getTokenVerifier(), 'function');

      const user = await verifyAccessToken('test-token');
      assert.equal(user.id, 'mocked-id');

      setTokenVerifierForTests(null);
      assert.equal(getTokenVerifier(), null);
    });
  });

  describe('2. User Role Validation & Constraints', () => {
    it('userRoleSchema accepts valid UUID and role', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const parsedUser = userRoleSchema.safeParse({ userId: validUuid, role: 'user' });
      assert.equal(parsedUser.success, true);

      const parsedAdmin = userRoleSchema.safeParse({ userId: validUuid, role: 'admin' });
      assert.equal(parsedAdmin.success, true);
    });

    it('userRoleSchema rejects invalid UUID or unrecognized role', () => {
      const invalidUuidResult = userRoleSchema.safeParse({ userId: 'not-a-uuid', role: 'admin' });
      assert.equal(invalidUuidResult.success, false);

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const invalidRoleResult = userRoleSchema.safeParse({ userId: validUuid, role: 'superadmin' });
      assert.equal(invalidRoleResult.success, false);
    });

    it('setUserRole rejects invalid payload before invoking Supabase', async () => {
      await assert.rejects(
        () => setUserRole('invalid-uuid', 'admin'),
        (err) => err instanceof AppError && err.statusCode === 400
      );

      await assert.rejects(
        () => setUserRole('123e4567-e89b-12d3-a456-426614174000', 'invalid-role'),
        (err) => err instanceof AppError && err.statusCode === 400
      );
    });
  });
});
