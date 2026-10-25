/**
 * Centralized application route definitions and navigation destinations.
 */
export const APP_ROUTES = Object.freeze({
  HOME: '/',
  AUTH: '/auth',
  AUTH_CALLBACK: '/auth/callback',
  RESET_PASSWORD: '/reset-password',
  EXPENSE: '/expense',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_KNOWLEDGE: '/admin/knowledge-base',
});

/**
 * Set of allowed post-authentication and redirection destination paths.
 */
export const ALLOWED_AUTH_DESTINATIONS = Object.freeze(
  new Set([
    APP_ROUTES.EXPENSE,
    APP_ROUTES.ADMIN_ANALYTICS,
    APP_ROUTES.ADMIN_KNOWLEDGE,
    '/admin',
    '/analytics',
  ])
);
