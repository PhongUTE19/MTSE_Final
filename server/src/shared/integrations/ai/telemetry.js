import crypto from 'node:crypto';

let usageRecorder = null;

/**
 * Registers the application-level AI usage recorder without creating an upward
 * dependency from shared AI infrastructure to feature modules.
 *
 * @param {(recordData: object) => any} fn
 */
export function setAIUsageRecorder(fn) {
  usageRecorder = typeof fn === 'function' ? fn : null;
}

/**
 * Computes a deterministic SHA-256 hash for a prompt string.
 *
 * @param {string|unknown} prompt
 * @returns {string|null}
 */
export function hashPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  return crypto.createHash('sha256').update(prompt.trim()).digest('hex');
}

/**
 * Non-fatal bridge to record AI usage telemetry.
 *
 * @param {object} recordData
 * @returns {object|null}
 */
export function recordProviderUsage(recordData) {
  if (!usageRecorder) return null;
  try {
    return usageRecorder(recordData);
  } catch (err) {
    console.error('[AITelemetry] Failed to record usage (non-fatal):', err.message);
    return null;
  }
}
