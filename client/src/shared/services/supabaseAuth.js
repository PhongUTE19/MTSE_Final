import { createClient } from '@supabase/supabase-js';
import { APP_ROUTES, ALLOWED_AUTH_DESTINATIONS } from '../constants/routes.js';

const supabaseUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined;
const supabaseAnonKey = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// This client intentionally receives only the public anon key. Authorization is
// ultimately enforced by the API and database RLS, never by this browser state.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    // Callback and recovery pages exchange PKCE codes explicitly. Keeping URL
    // detection off prevents a second, racing exchange during page startup.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  : null;

export function appUrl(pathname) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost:5173';
  return new URL(pathname, origin).toString();
}

export function safeNextPath(value) {
  if (!value || value === APP_ROUTES.HOME || value === APP_ROUTES.AUTH) return APP_ROUTES.HOME;
  const clean = value.replace(/\.html$/, '');
  if (clean === APP_ROUTES.ADMIN_KNOWLEDGE) return APP_ROUTES.ADMIN_KNOWLEDGE;
  if (clean === APP_ROUTES.ADMIN_ANALYTICS) return APP_ROUTES.ADMIN_ANALYTICS;
  if (clean === APP_ROUTES.EXPENSE) return APP_ROUTES.EXPENSE;
  return ALLOWED_AUTH_DESTINATIONS.has(clean) ? clean : APP_ROUTES.HOME;
}

/**
 * Resolves the user's role from trusted app_metadata.
 * user_metadata is user-editable and never trusted for authorization.
 *
 * @param {object} sessionOrUser
 * @returns {'admin'|'user'}
 */
export function getUserRole(sessionOrUser) {
  const user = sessionOrUser?.user || sessionOrUser;
  return user?.app_metadata?.role === 'admin' ? 'admin' : 'user';
}

/**
 * Computes post-authentication navigation path based on trusted user role.
 * Both Users and Admins are directed to the shared home dashboard (/) by default.
 * If a valid authorized sub-route was requested, it is preserved; unauthorized role routes redirect to /.
 *
 * @param {'admin'|'user'|string} [role] - Verified role from app_metadata
 * @param {string|null} [requestedNext] - Optional requested next path
 * @returns {string} Route destination
 */
export function getPostAuthPath(role, requestedNext) {
  const isAdmin = role === 'admin';
  if (isAdmin) {
    if (requestedNext === APP_ROUTES.ADMIN_KNOWLEDGE) {
      return APP_ROUTES.ADMIN_KNOWLEDGE;
    }
    if (requestedNext === APP_ROUTES.ADMIN_ANALYTICS) {
      return APP_ROUTES.ADMIN_ANALYTICS;
    }
    if (requestedNext === APP_ROUTES.EXPENSE) {
      return APP_ROUTES.EXPENSE;
    }
    return APP_ROUTES.HOME;
  }

  // Non-admin user: never allow access to admin routes or landing/auth pages; redirect to /
  if (
    requestedNext &&
    !requestedNext.startsWith('/admin') &&
    requestedNext !== APP_ROUTES.HOME &&
    requestedNext !== APP_ROUTES.AUTH
  ) {
    const clean = requestedNext.replace(/\.html$/, '');
    if (clean === APP_ROUTES.EXPENSE) return clean;
  }
  return APP_ROUTES.HOME;
}


/**
 * Extracts reliable retry duration from error headers or provider metadata.
 * Returns formatted duration string (e.g. "60 seconds", "2 minutes") or null if unavailable.
 *
 * @param {Error|object} error
 * @returns {string|null}
 */
export function extractRetryDuration(error) {
  if (!error || typeof error !== 'object') return null;

  // 1. Direct numeric/string retryAfter or retry_after fields
  const directValue = error.retryAfter ?? error.retry_after;
  if (directValue !== undefined && directValue !== null) {
    const numeric = Number(directValue);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return `${numeric} seconds`;
    }
    if (typeof directValue === 'string' && directValue.trim()) {
      return directValue.trim();
    }
  }

  // 2. Retry-After HTTP response header
  const headers = error.headers || error.response?.headers;
  if (headers) {
    const rawHeader = typeof headers.get === 'function'
      ? (headers.get('retry-after') || headers.get('Retry-After'))
      : (headers['retry-after'] || headers['Retry-After']);

    if (rawHeader) {
      const numeric = Number(rawHeader);
      if (!Number.isNaN(numeric) && numeric > 0) {
        return `${numeric} seconds`;
      }
      if (typeof rawHeader === 'string' && rawHeader.trim()) {
        return rawHeader.trim();
      }
    }
  }

  // 3. Provider error message metadata (e.g. "once every 60 seconds", "try again in 30 seconds")
  const message = error.message || '';
  const match = message.match(/(?:once every|retry after|try again in|wait)\s+(\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|s|m|h))/i);
  if (match) {
    return match[1].trim();
  }

  return null;
}

/**
 * Standardizes authentication error messages, specifically handling rate limits
 * with clear English guidance and actual retry duration when reliably available.
 *
 * @param {Error|object} error - Auth error object
 * @param {'signup'|'signin'|'forgot'|'callback'} [context='signup']
 * @returns {string} User-friendly actionable message
 */
export function formatAuthError(error, context = 'signup') {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const message = error.message || '';
  const status = error.status || error.statusCode;
  const lower = message.toLowerCase();

  // Rate-limiting detection (HTTP 429, GoTrue codes, or rate-limit text)
  if (
    status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit')
  ) {
    const retryDuration = extractRetryDuration(error);

    // If provider message already includes complete security instructions with duration, preserve it
    if (lower.includes('once every')) {
      return message;
    }

    if (retryDuration) {
      if (context === 'signup') {
        return `Too many sign-up requests. Please try again in ${retryDuration}, or sign in if you already have an account.`;
      }
      if (context === 'forgot') {
        return `Password reset requested too frequently. Please try again in ${retryDuration}.`;
      }
      return `Too many requests. Please try again in ${retryDuration}.`;
    }

    // Reliable duration is unavailable: do NOT invent a countdown or promise "a few minutes"
    if (context === 'signup') {
      return (
        'Too many sign-up requests or emails sent recently. ' +
        'Please try again later, or sign in if you already have an account.'
      );
    }
    if (context === 'forgot') {
      return 'Password reset requested too frequently. Please try again later.';
    }
    return 'Too many requests. Please try again later.';
  }

  if (lower.includes('user already registered')) {
    return 'An account with this email address already exists. Please sign in or reset your password.';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Invalid email address or password. Please verify your credentials and try again.';
  }

  return message || 'We could not complete that request. Please try again.';
}

export async function getAccessToken() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function exchangeCodeForSessionFromUrl() {
  if (!supabase) return { session: null, error: new Error('Authentication is not configured.') };
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    return { session: data.session, error };
  }

  // PKCE is the default flow. This fallback also keeps recovery links working
  // if an existing Supabase project is configured to return implicit tokens.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    return { session: data.session, error };
  }

  const { data: { session } } = await supabase.auth.getSession();
  return { session, error: null };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
