import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
  return new URL(pathname, window.location.origin).toString();
}

export function safeNextPath(value) {
  if (!value) return '/expense';
  const clean = value.replace(/\.html$/, '');
  return clean === '/expense' || clean === '/admin' ? clean : '/expense';
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
