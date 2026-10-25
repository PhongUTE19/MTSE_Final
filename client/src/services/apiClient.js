import { getAccessToken, signOut } from './supabaseAuth.js';

let isHandlingUnauthorized = false;

async function handleUnauthorized() {
  if (isHandlingUnauthorized) return;
  isHandlingUnauthorized = true;
  try {
    await signOut();
  } catch {
    // Ignore sign-out errors when session is already gone
  } finally {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('spendwise:unauthorized'));
    }
    setTimeout(() => {
      isHandlingUnauthorized = false;
    }, 1000);
  }
}

/**
 * Shared API client for making HTTP requests with structured JSON error parsing.
 */

/**
 * Executes a fetch request, parses JSON response, and handles HTTP errors.
 * Automatically attaches Authorization header if an authenticated session exists.
 * Dispatches 'spendwise:unauthorized' and signs out on HTTP 401 responses.
 *
 * @param {string} url - Request URL
 * @param {RequestInit} [options={}] - Fetch options
 * @param {((status: number) => string) | string} [fallbackError] - Fallback message or callback if backend doesn't return `error` field
 * @returns {Promise<any>} Parsed JSON response body
 */
export async function apiRequest(url, options = {}, fallbackError) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      await handleUnauthorized();
    }
    let message = data.error;
    if (!message) {
      if (typeof fallbackError === 'function') {
        message = fallbackError(res.status);
      } else if (typeof fallbackError === 'string') {
        message = fallbackError;
      } else {
        message = `Request failed with status ${res.status}`;
      }
    }
    throw new Error(message);
  }

  return data;
}

/**
 * Helper for JSON POST, PUT, DELETE, etc. requests.
 *
 * @param {string} url - Request URL
 * @param {string} method - HTTP method (e.g. 'POST', 'PUT', 'DELETE')
 * @param {any} [body] - Object to be serialized as JSON body
 * @param {((status: number) => string) | string} [fallbackError] - Fallback message or callback
 * @returns {Promise<any>}
 */
export function apiJsonRequest(url, method, body, fallbackError) {
  const options = {
    method,
  };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  return apiRequest(url, options, fallbackError);
}
