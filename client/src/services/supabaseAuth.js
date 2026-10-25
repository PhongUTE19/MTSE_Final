import { createClient } from '@supabase/supabase-js';

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
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5173';
  return new URL(pathname, origin).toString();
}

export function safeNextPath(value) {
  if (!value || value === '/' || value === '/auth') return '/expense';
  const clean = value.replace(/\.html$/, '');
  return clean === '/expense' || clean === '/admin' || clean === '/analytics' || clean === '/handbook' || clean === '/demo' ? clean : '/expense';
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
 * Admins are directed to /analytics by default; regular users are directed to /expense.
 *
 * @param {'admin'|'user'|string} [role] - Verified role from app_metadata
 * @param {string|null} [requestedNext] - Optional requested next path
 * @returns {string} Route destination
 */
export function getPostAuthPath(role, requestedNext) {
  const isAdmin = role === 'admin';
  if (isAdmin) {
    if (requestedNext === '/admin' || requestedNext === '/analytics') {
      return requestedNext;
    }
    return '/analytics';
  }

  // Non-admin user: never allow access to admin routes or landing/auth pages
  if (
    requestedNext &&
    requestedNext !== '/admin' &&
    requestedNext !== '/analytics' &&
    requestedNext !== '/' &&
    requestedNext !== '/auth'
  ) {
    const clean = requestedNext.replace(/\.html$/, '');
    if (clean === '/expense' || clean === '/handbook' || clean === '/demo') return clean;
  }
  return '/expense';
}

/**
 * Standardizes authentication error messages, specifically handling rate limits
 * with actionable instructions and countdown guidance.
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
    if (lower.includes('once every') || lower.includes('seconds')) {
      return message;
    }
    if (context === 'signup') {
      return 'Too many sign-up requests or emails sent recently. Please wait a few minutes before trying again, or sign in if you already have an account.';
    }
    if (context === 'forgot') {
      return 'Password reset requested too frequently. Please wait a few minutes before requesting another reset link.';
    }
    return 'Too many requests. Please wait a moment and try again.';
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
