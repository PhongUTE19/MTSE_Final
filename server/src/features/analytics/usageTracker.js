import crypto from 'crypto';
import { calculateRequestCost } from './pricingConfig.js';

/**
 * Generates a deterministic SHA-256 hash of the resolved prompt text.
 * Never stores or returns the raw prompt content.
 *
 * @param {string} prompt - Fully resolved prompt or system instruction
 * @returns {string|null} Hexadecimal hash string or null if unavailable
 */
export function hashPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return null;
  }
  return crypto.createHash('sha256').update(prompt.trim(), 'utf-8').digest('hex');
}

/**
 * Categorizes an error encountered during provider invocation into a high-level operational bucket.
 *
 * @param {Error|any} error
 * @returns {string} Error category
 */
export function categorizeError(error) {
  if (!error) return 'UNKNOWN';

  const msg = String(error.message || error).toLowerCase();
  const name = String(error.name || '').toLowerCase();
  const status = error.status || error.code || error.statusCode;

  if (name === 'aborterror' || msg.includes('aborted') || msg.includes('cancelled')) {
    return 'ABORTED';
  }

  if (status === 429 || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('429')) {
    return 'RATE_LIMIT';
  }

  if (status === 503 || msg.includes('unavailable') || msg.includes('503')) {
    return 'SERVICE_UNAVAILABLE';
  }

  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api_key') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission_denied')
  ) {
    return 'AUTHENTICATION';
  }

  if (status === 400 || msg.includes('invalid_argument') || msg.includes('invalid argument') || msg.includes('bad request')) {
    return 'INVALID_ARGUMENT';
  }

  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('deadline')) {
    return 'TIMEOUT';
  }

  if (msg.includes('econnreset') || msg.includes('enotfound') || msg.includes('fetch failed')) {
    return 'NETWORK';
  }

  return 'PROVIDER_ERROR';
}

/**
 * Sanitizes error messages to ensure no sensitive prompts, keys, or credentials leak into analytics.
 *
 * @param {Error|any} error
 * @returns {string} Safe summary message
 */
export function sanitizeErrorMessage(error) {
  if (!error) return 'Unknown error';
  let message = typeof error.message === 'string' ? error.message : String(error);

  // Redact potential Google API keys (AIza...)
  message = message.replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED_API_KEY]');

  // Redact generic JWT or Bearer tokens
  message = message.replace(/eyJ[0-9A-Za-z-_=]+\.[0-9A-Za-z-_=]+\.?[0-9A-Za-z-_=]*/g, '[REDACTED_TOKEN]');

  // Limit error message length to avoid embedding prompt copies
  if (message.length > 250) {
    message = message.substring(0, 247) + '...';
  }

  return message;
}

/**
 * In-Memory Ring Buffer store for recent AI usage records.
 *
 * NOTE ON PERSISTENCE LIMITATION:
 * This in-memory store is non-durable (`isDurable: false`). It does NOT survive
 * process restarts and is bounded to prevent memory growth. Pluggable sinks
 * can be registered via `subscribe()` for durable storage (e.g. Supabase).
 */
export class InMemoryUsageStore {
  constructor(maxCapacity = 200) {
    this.maxCapacity = Math.max(1, maxCapacity);
    this.buffer = [];
    this.subscribers = new Set();
    this.isDurable = false;
  }

  /**
   * Adds a record to the bounded ring buffer and notifies subscribers.
   *
   * @param {object} record
   */
  add(record) {
    if (this.buffer.length >= this.maxCapacity) {
      this.buffer.shift(); // Evict oldest
    }
    this.buffer.push(record);

    for (const sink of this.subscribers) {
      try {
        const result = sink(record);
        // Handle asynchronous subscribers safely without unhandled rejections
        if (result && typeof result.catch === 'function') {
          result.catch((sinkErr) => {
            console.error('[UsageStore] Async subscriber error:', sinkErr.message);
          });
        }
      } catch (sinkErr) {
        console.error('[UsageStore] Subscriber error:', sinkErr.message);
      }
    }
  }

  /**
   * Returns recent records up to the specified limit.
   * Passing 0 explicitly returns an empty array.
   *
   * @param {number} [limit=50]
   * @returns {Array<object>}
   */
  getRecent(limit = 50) {
    const requested = parseInt(limit, 10);
    if (isNaN(requested) || requested <= 0) {
      return [];
    }
    const count = Math.min(requested, this.buffer.length);
    return this.buffer.slice(-count);
  }

  /**
   * Subscribes a listener or external persistence sink to newly recorded usage.
   *
   * @param {(record: object) => void|Promise<void>} subscriber
   * @returns {() => void} Unsubscribe function
   */
  subscribe(subscriber) {
    if (typeof subscriber === 'function') {
      this.subscribers.add(subscriber);
      return () => this.subscribers.delete(subscriber);
    }
    return () => {};
  }

  /**
   * Clears the in-memory buffer (primarily for test isolation).
   */
  clear() {
    this.buffer = [];
  }

  /**
   * Returns the count of records currently in memory.
   */
  get count() {
    return this.buffer.length;
  }
}

// Global default in-memory usage store instance
export const defaultUsageStore = new InMemoryUsageStore();

/**
 * Creates an isolated usage tracker instance with its own store.
 *
 * @param {object} [options]
 * @param {InMemoryUsageStore} [options.store]
 * @returns {object} Tracker instance
 */
export function createUsageTracker(options = {}) {
  const store = options.store || new InMemoryUsageStore();

  function trackUsage(recordData) {
    try {
      if (!recordData || typeof recordData !== 'object') {
        return null;
      }

      const now = new Date();
      const id = recordData.id || crypto.randomUUID();
      const timestamp = recordData.timestamp || now.toISOString();

      const feature = recordData.feature || 'chat';
      const operation = recordData.operation || 'unknown';
      const provider = recordData.provider || 'google-genai';
      const model = recordData.model || 'unknown';

      // Identify outcome and refusals
      const isRefusal = Boolean(recordData.isRefusal || recordData.refusal);
      const refusalReason = recordData.refusalReason || null;
      let outcome = recordData.outcome;
      if (!outcome) {
        if (recordData.error) {
          outcome = 'failure';
        } else if (isRefusal) {
          outcome = 'refusal';
        } else {
          outcome = 'success';
        }
      }

      // Timing and attempts (guaranteeing attempts[].error is always sanitized)
      const durationMs = typeof recordData.durationMs === 'number' ? Math.max(0, recordData.durationMs) : 0;
      const timeToFirstTokenMs = typeof recordData.timeToFirstTokenMs === 'number'
        ? Math.max(0, recordData.timeToFirstTokenMs)
        : null;

      const attempts = Array.isArray(recordData.attempts) && recordData.attempts.length > 0
        ? recordData.attempts.map((att, idx) => ({
            attemptNumber: att.attemptNumber || idx + 1,
            durationMs: typeof att.durationMs === 'number' ? Math.max(0, att.durationMs) : 0,
            status: att.status === 'failure' ? 'failure' : 'success',
            error: att.error
              ? {
                  code: String(att.error.code || att.error.status || 'UNKNOWN'),
                  category: categorizeError(att.error),
                  message: sanitizeErrorMessage(att.error),
                }
              : null,
          }))
        : [
            {
              attemptNumber: 1,
              durationMs,
              status: outcome === 'failure' ? 'failure' : 'success',
              error: recordData.error
                ? {
                    code: String(recordData.error.code || recordData.error.status || 'UNKNOWN'),
                    category: categorizeError(recordData.error),
                    message: sanitizeErrorMessage(recordData.error),
                  }
                : null,
            },
          ];

      const totalAttempts = typeof recordData.totalAttempts === 'number'
        ? Math.max(1, recordData.totalAttempts)
        : attempts.length;

      // Token counts: Explicitly represent unavailable values as null
      const rawTokens = recordData.tokenUsage || {};
      const hasInputTokens = typeof rawTokens.inputTokens === 'number';
      const hasOutputTokens = typeof rawTokens.outputTokens === 'number';
      const tokenCountsAvailable = typeof rawTokens.tokenCountsAvailable === 'boolean'
        ? rawTokens.tokenCountsAvailable
        : Boolean(hasInputTokens && hasOutputTokens);

      const inputTokens = hasInputTokens ? rawTokens.inputTokens : null;
      const outputTokens = hasOutputTokens ? rawTokens.outputTokens : null;
      const totalTokens = typeof rawTokens.totalTokens === 'number'
        ? rawTokens.totalTokens
        : (hasInputTokens && hasOutputTokens ? inputTokens + outputTokens : null);

      const tokenCountsComplete = typeof rawTokens.tokenCountsComplete === 'boolean'
        ? rawTokens.tokenCountsComplete
        : Boolean(hasInputTokens && hasOutputTokens && totalTokens !== null);

      const tokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens,
        tokenCountsAvailable,
        tokenCountsComplete,
      };

      // Clean separation of prompt metadata: ID, explicit version, and content hash
      let promptId = recordData.promptId || null;
      let promptVersion = recordData.promptVersion || null;
      let promptHash = recordData.promptHash || (recordData.prompt ? hashPrompt(recordData.prompt) : null);

      // Normalize backward-compatible legacy formats passed into promptVersion
      if (promptVersion && typeof promptVersion === 'string') {
        const trimmed = promptVersion.trim();
        if (/^[a-f0-9]{64}$/i.test(trimmed)) {
          // Pure 64-hex SHA-256 hash was passed in promptVersion; move to promptHash, do not invent version
          if (!promptHash) promptHash = trimmed;
          promptVersion = null;
        } else if (/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
          // Composite <id>:<version>:<hash>
          const parts = trimmed.split(':');
          if (!promptId) promptId = parts[0];
          promptVersion = parts[1];
          if (!promptHash) promptHash = parts[2];
        } else if (/^[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
          // Composite <version>:<hash>
          const parts = trimmed.split(':');
          promptVersion = parts[0];
          if (!promptHash) promptHash = parts[1];
        }
      }

      // Real tool usage: honestly represent empty list when no tool executions exist
      const toolsExecuted = Array.isArray(recordData.toolsExecuted) ? recordData.toolsExecuted : [];

      // Estimated request cost calculated from verified pricing and actual tokens
      const cost = recordData.cost || calculateRequestCost(model, tokenUsage);
      const estimatedCost = cost.estimatedCostUsd;
      const costStatus = cost.costStatus;

      // Error categorization and sanitization
      let errorInfo = null;
      if (recordData.error) {
        errorInfo = {
          code: String(recordData.error.code || recordData.error.status || 'UNKNOWN'),
          category: categorizeError(recordData.error),
          message: sanitizeErrorMessage(recordData.error),
        };
      }

      const normalizedRecord = {
        id,
        timestamp,
        feature,
        operation,
        provider,
        model,
        outcome,
        isRefusal,
        refusal: isRefusal,
        refusalReason,
        durationMs,
        timeToFirstTokenMs,
        attempts,
        attemptCount: totalAttempts,
        totalAttempts,
        tokenUsage,
        promptId,
        promptVersion,
        promptHash,
        toolsExecuted,
        cost,
        estimatedCost,
        costStatus,
        error: errorInfo,
      };

      store.add(normalizedRecord);
      return normalizedRecord;
    } catch (err) {
      // Non-fatal: Tracking failures must never disrupt user requests
      console.error('[UsageTracker] Failed to record usage (non-fatal):', err.message);
      return null;
    }
  }

  return {
    trackUsage,
    store,
    getRecent: (limit) => store.getRecent(limit),
    clear: () => store.clear(),
  };
}

// Default tracker instance
const defaultTracker = createUsageTracker({ store: defaultUsageStore });

/**
 * Records an AI usage event into the usage tracking foundation.
 * Guaranteed to be non-fatal to the caller.
 *
 * @param {object} recordData
 * @returns {object|null} The recorded normalized record, or null if tracking failed
 */
export function recordUsage(recordData) {
  return defaultTracker.trackUsage(recordData);
}

/**
 * Retrieves recently recorded usage events from the in-memory store.
 *
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
export function getRecentUsageRecords(limit = 50) {
  return defaultUsageStore.getRecent(limit);
}

/**
 * Retrieves the underlying usage store instance.
 *
 * @returns {InMemoryUsageStore}
 */
export function getUsageStore() {
  return defaultUsageStore;
}
