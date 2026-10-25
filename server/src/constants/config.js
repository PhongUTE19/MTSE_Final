/**
 * Server Configuration Constants
 * Centralized repository for operational limits, retries, thresholds, and defaults.
 */

export const STATUS_KEYS = Object.freeze({
  OK: 'ok',
  ERROR: 'error',
});

export const VECTOR_CONFIG = Object.freeze({
  DEFAULT_SIZE: 3072,
  DISTANCE_COSINE: 'Cosine',
});

export const RETRY_CONFIG = Object.freeze({
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1200,
});

export const RETRIEVAL_CONFIG = Object.freeze({
  DEFAULT_TOP_K: 4,
  MIN_CANDIDATE_POOL: 6,
  AMENDMENT_SCORE_THRESHOLD: 0.55,
  SCORE_PRECISION: 4,
});

export const PROMPT_CONSTRAINTS = Object.freeze({
  MIN_LENGTH: 20,
  MAX_LENGTH: 10000,
});

export const GUARDRAIL_CONFIG = Object.freeze({
  DEFAULT_TIMEOUT_MS: 30000,
  STREAM_TIMEOUT_MS: 45000,
  MIN_ANSWER_LENGTH: 2,
});

export const CHUNKING_CONFIG = Object.freeze({
  DEFAULT_CHUNK_SIZE: 1200,
  DEFAULT_CHUNK_OVERLAP: 200,
  MIN_CHUNK_SIZE: 100,
  MAX_CHUNK_SIZE: 4000,
  SEPARATORS: Object.freeze(['\n\n', '\n', '. ', '? ', '! ', '; ', ' ', '']),
});

export const PAGINATION_LIMITS = Object.freeze({
  DEFAULT_LIMIT: 10,
  MIN_LIMIT: 1,
  MAX_LIMIT: 50,
  DEFAULT_OFFSET: 0,
});

export const SERVER_CONFIG_DEFAULTS = Object.freeze({
  PORT: 3000,
  DEFAULT_PORT_STR: '3000',
  SIMILARITY_THRESHOLD: 0.60,
  DEFAULT_SIMILARITY_THRESHOLD_STR: '0.60',
  TOP_K: 4,
  DEFAULT_TOP_K_STR: '4',
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  EMBEDDING_MODEL: 'gemini-embedding-001',
  AI_PROVIDER: 'gemini',
  QDRANT_COLLECTION: 'spendwise',
  PLACEHOLDER_KEY: 'your_gemini_api_key_here',
});

export const RATE_LIMIT_CONFIG = Object.freeze({
  API: Object.freeze({
    WINDOW_MS: 15 * 60 * 1000,
    MAX: 300,
    MESSAGE: 'Too many requests from this IP. Please try again after 15 minutes.',
  }),
  CHAT: Object.freeze({
    WINDOW_MS: 60 * 1000,
    MAX: 30,
    MESSAGE: 'Too many chat requests. Please slow down and try again shortly.',
  }),
  EXPENSE_AGENT: Object.freeze({
    WINDOW_MS: 60 * 1000,
    MAX: 30,
    MESSAGE: 'Too many expense assistant requests. Please slow down and try again shortly.',
  }),
  RECEIPT_OCR: Object.freeze({
    WINDOW_MS: 60 * 1000,
    MAX: 15,
    MESSAGE: 'Too many receipt processing requests. Please slow down and try again shortly.',
  }),
  INDEXING: Object.freeze({
    WINDOW_MS: 15 * 60 * 1000,
    MAX: 10,
    MESSAGE: 'Knowledge re-indexing requested too frequently. Please try again later.',
  }),
});
