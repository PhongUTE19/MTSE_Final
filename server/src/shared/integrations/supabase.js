import { createClient } from '@supabase/supabase-js';
import { config } from '../../config.js';

let supabaseClient = null;

/**
 * Returns the shared singleton Supabase client instance if configured, or null otherwise.
 * Reusable across any feature requiring database operations.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getSupabaseClient() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * Checks if Supabase persistence credentials are fully configured.
 *
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseServiceKey);
}

/**
 * Returns a short-lived client authenticated as the verified request user.
 * Never use the service-role client for ordinary user data: it bypasses RLS.
 *
 * @param {string} accessToken A token already verified by authenticate.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function createUserScopedSupabaseClient(accessToken) {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !accessToken) return null;

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

/**
 * Auth client used only to verify a bearer token with Supabase Auth.
 * This uses the public anon key; getUser() validates the token server-side.
 */
export function createSupabaseAuthClient() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
