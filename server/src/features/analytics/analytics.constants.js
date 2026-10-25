/**
 * Centralized Domain Constants and Defaults for AI Usage Analytics.
 */

export const ANALYTICS_TABLE = 'ai_usage_analytics';

export const OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  REFUSAL: 'refusal',
});

export const FEATURES = Object.freeze({
  RAG_CHAT: 'rag_chat',
  EMBEDDING: 'embedding',
  KNOWLEDGE_INDEX: 'knowledge_index',
  EXPENSE_AGENT: 'expense_agent',
  RECEIPT_EXTRACTION: 'receipt_extraction',
});

export const PROVIDERS = Object.freeze({
  GOOGLE_GENAI: 'google-genai',
  GOOGLE: 'google',
});

export const PERCENTILES = Object.freeze({
  P50: 0.5,
  P95: 0.95,
});

export const TIME_WINDOW_MS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
});

export const DEFAULT_TIME_RANGE = '7d';

export const PAGINATION_DEFAULTS = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

export const IN_MEMORY_DEFAULTS = Object.freeze({
  RECENT_QUERY_LIMIT: 1000,
  STORE_CAPACITY: 1000,
});

export const PERSISTENCE_PROVIDERS = Object.freeze({
  SUPABASE: 'supabase',
  IN_MEMORY: 'in-memory',
});

export const WRITER_DEFAULTS = Object.freeze({
  MAX_QUEUE_SIZE: 500,
  BATCH_SIZE: 10,
  FLUSH_INTERVAL_MS: 1000,
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 200,
});
