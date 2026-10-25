import { UnauthorizedError } from '../errors/index.js';
import {
  verifyAccessToken,
  toVerifiedIdentity,
  setTokenVerifierForTests,
} from '../../features/auth/auth.service.js';

export { setTokenVerifierForTests };

function extractBearerToken(authHeader) {
  if (!authHeader || !/^Bearer\s+\S+$/i.test(authHeader)) {
    throw new UnauthorizedError('Authentication token is required.');
  }
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Authentication verification middleware.
 * Validates request credentials (Bearer token in Authorization header)
 * and attaches verified user identity context to `req.user`.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
export async function authenticate(req, res, next) {
  try {
    const token = extractBearerToken(req.headers?.authorization);
    const verifiedUser = await verifyAccessToken(token);
    req.user = toVerifiedIdentity(verifiedUser, token);
    next();
  } catch (error) {
    next(error instanceof UnauthorizedError ? error : new UnauthorizedError('Invalid or expired authentication token.'));
  }
}

/**
 * Optional authentication middleware.
 * Attaches user identity to `req.user` if a valid Bearer token is present,
 * without rejecting unauthenticated requests.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
export async function optionalAuthenticate(req, res, next) {
  if (!req.headers?.authorization) return next();
  try {
    const token = extractBearerToken(req.headers.authorization);
    const verifiedUser = await verifyAccessToken(token);
    req.user = toVerifiedIdentity(verifiedUser, token);
  } catch {
    // Optional auth never turns an otherwise public endpoint into a 401.
  }
  next();
}
