import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseAuth.js';

/**
 * Custom hook managing reactive Supabase authentication session lifecycle for route gates.
 *
 * Handles initial session retrieval, real-time auth state change subscription,
 * unmount cleanup, and unauthorized event listening.
 *
 * @param {object} [options={}]
 * @param {(session: object) => boolean | void} [options.onValidate] - Callback to validate session (e.g. check role). Return false if invalid and gate handled redirect.
 * @param {() => void} [options.onUnauthorized] - Callback when unauthenticated or session invalidated.
 * @returns {{ session: object | null | undefined, loading: boolean }}
 */
export function useSession({ onValidate, onUnauthorized } = {}) {
  const [session, setSession] = useState(undefined);
  const callbacksRef = useRef({ onValidate, onUnauthorized });

  useEffect(() => {
    callbacksRef.current = { onValidate, onUnauthorized };
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      callbacksRef.current.onUnauthorized?.();
      return undefined;
    }

    let active = true;

    const applySession = (currentSession) => {
      if (!active) return;
      if (!currentSession) {
        callbacksRef.current.onUnauthorized?.();
        return;
      }

      if (callbacksRef.current.onValidate) {
        const isValid = callbacksRef.current.onValidate(currentSession);
        if (isValid === false) {
          return;
        }
      }

      setSession(currentSession);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } = {} } = {}) => {
        applySession(currentSession);
      })
      .catch(() => {
        if (active) {
          callbacksRef.current.onUnauthorized?.();
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      applySession(currentSession);
    });

    const handleUnauthorizedEvent = () => {
      if (active) {
        callbacksRef.current.onUnauthorized?.();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('spendwise:unauthorized', handleUnauthorizedEvent);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('spendwise:unauthorized', handleUnauthorizedEvent);
      }
    };
  }, []);

  return { session, loading: session === undefined };
}
