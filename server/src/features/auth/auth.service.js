import { UnauthorizedError, AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createSupabaseAuthClient, getSupabaseClient } from '../../shared/integrations/supabase.js';
import { userRoleSchema } from './auth.schemas.js';

let tokenVerifier = null;

/**
 * Verifies a bearer token with Supabase Auth or test verifier seam.
 *
 * @param {string} token - Raw bearer access token
 * @returns {Promise<object>} Verified Supabase user record
 */
export async function verifyAccessToken(token) {
  if (tokenVerifier) {
    return tokenVerifier(token);
  }

  const client = createSupabaseAuthClient();
  if (!client) {
    throw new UnauthorizedError('Authentication is not configured.');
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new UnauthorizedError('Invalid or expired authentication token.');
  }

  return data.user;
}

/**
 * Maps a verified Supabase user record to a trusted application identity context.
 * Role is strictly derived from verified `app_metadata.role` (admin or user).
 * Client-submitted `user_metadata` is never used for authorization decisions.
 *
 * @param {object} user - Supabase user object
 * @param {string} token - Raw bearer token
 * @returns {{ id: string, email: string, role: string, token: string }}
 */
export function toVerifiedIdentity(user, token) {
  const requestedRole = user?.app_metadata?.role;
  const role = requestedRole === 'admin' ? 'admin' : 'user';
  return {
    id: user?.id,
    email: user?.email || '',
    role,
    token,
  };
}

/**
 * Assigns an administrative or regular role to a user in Supabase Auth.
 * Operates via privileged Supabase admin API (`auth.admin.updateUserById`).
 *
 * @param {string} userId - Supabase user UUID
 * @param {string} requestedRole - 'user' or 'admin'
 * @returns {Promise<{ userId: string, role: string }>}
 */
export async function setUserRole(userId, requestedRole) {
  const parsed = userRoleSchema.safeParse({ userId, role: requestedRole });
  if (!parsed.success) {
    const message = parsed.error.issues?.[0]?.message || 'Invalid user role request.';
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new AppError('Supabase server credentials are not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const { data: current, error: lookupError } = await client.auth.admin.getUserById(userId);
  if (lookupError || !current?.user) {
    throw new AppError(`Unable to find the requested user: ${lookupError?.message || 'not found'}`, HTTP_STATUS.NOT_FOUND);
  }

  const { error: updateError } = await client.auth.admin.updateUserById(userId, {
    app_metadata: { ...(current.user.app_metadata || {}), role: requestedRole },
  });

  if (updateError) {
    throw new AppError(`Unable to update role: ${updateError.message}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return { userId, role: requestedRole };
}

/**
 * Test seam: allows integration and unit tests to mock token verification.
 *
 * @param {Function|null} verifier
 */
export function setTokenVerifierForTests(verifier) {
  tokenVerifier = verifier;
}

/**
 * Returns currently configured test token verifier, if any.
 *
 * @returns {Function|null}
 */
export function getTokenVerifier() {
  return tokenVerifier;
}
