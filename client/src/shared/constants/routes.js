/**
 * Centralized application route definitions and navigation destinations.
 */
export const APP_ROUTES = Object.freeze({
  LANDING: '/',
  HOME: '/home',
  AUTH: '/auth',
  AUTH_CALLBACK: '/auth/callback',
  RESET_PASSWORD: '/reset-password',
  EXPENSE: '/expense',
  EXPENSE_RECEIPTS: '/expense/receipts',
  EXPENSE_TRANSACTIONS: '/expense/transactions',
  EXPENSE_CATEGORIES: '/expense/categories',
  ADMIN: '/admin',
  ADMIN_AI_USAGE: '/admin/ai-usage',
  ADMIN_KNOWLEDGE_BASE: '/admin/knowledge-base',
});

/**
 * Set of allowed post-authentication and redirection destination paths.
 */
export const ALLOWED_AUTH_DESTINATIONS = Object.freeze(
  new Set([
    APP_ROUTES.HOME,
    APP_ROUTES.EXPENSE,
    APP_ROUTES.EXPENSE_RECEIPTS,
    APP_ROUTES.EXPENSE_TRANSACTIONS,
    APP_ROUTES.EXPENSE_CATEGORIES,
    APP_ROUTES.ADMIN_AI_USAGE,
    APP_ROUTES.ADMIN_KNOWLEDGE_BASE,
  ])
);
