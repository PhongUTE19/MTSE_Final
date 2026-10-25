export const USER_ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export const STATUS_KEYS = Object.freeze({
  OK: 'ok',
  ERROR: 'error',
});

export const FILE_EXTENSIONS = Object.freeze({
  MARKDOWN: '.md',
});

export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 10,
  DEFAULT_OFFSET: 0,
  OPTIONS: [10, 30, 50],
});

export const API_ENDPOINTS = Object.freeze({
  HEALTH: '/api/health',
  USER_CHAT: '/api/user/chat',
  ADMIN_STATUS: '/api/admin/status',
  ADMIN_DOCUMENTS: '/api/admin/documents',
  ADMIN_CHUNKS: '/api/admin/chunks',
  ADMIN_INDEX: '/api/admin/index',
  ADMIN_PROMPT: '/api/admin/prompt',
  ADMIN_PROMPT_RESET: '/api/admin/prompt/reset',
  ADMIN_ANALYTICS_OVERVIEW: '/api/admin/analytics/overview',
  ADMIN_ANALYTICS_TIMESERIES: '/api/admin/analytics/timeseries',
  ADMIN_ANALYTICS_BREAKDOWN: '/api/admin/analytics/breakdown',
  ADMIN_ANALYTICS_HISTORY: '/api/admin/analytics/history',
});

export const HTTP_METHODS = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
});

export const ADMIN_PANELS = Object.freeze({
  DOCUMENTS: 'documents',
  CHUNKS: 'chunks',
  PROMPT: 'prompt',
  ANALYTICS: 'analytics',
});

export const ADMIN_TABS = Object.freeze({
  KNOWLEDGE: 'knowledge',
  ANALYTICS: 'analytics',
});

export const TOAST_TYPES = Object.freeze({
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
});

export const TOAST_DURATIONS = Object.freeze({
  SUCCESS: 4000,
  INFO: 4000,
  WARNING: 6000,
  ERROR: 8000,
});

export const CHAT_CONFIG = Object.freeze({
  DEFAULT_SHOW_DEBUG: false,
});

export const STREAM_REVEAL_CONFIG = Object.freeze({
  BASE_CHARS_PER_TICK: 2,
  TICK_INTERVAL_MS: 25,
  CATCHUP_THRESHOLD: 40,
  CATCHUP_CHARS_PER_TICK: 6,
  MAX_BATCH_SIZE: 16,
});

export const VALIDATION_LIMITS = Object.freeze({
  CHAT_MESSAGE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 2000,
  },
  DOCUMENT_FILENAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
    REQUIRED_EXTENSION: '.md',
  },
  DOCUMENT_CONTENT: {
    MIN_LENGTH: 1,
    REQUIRED_SECTION_HEADER: '## ',
  },
  SYSTEM_PROMPT: {
    MIN_LENGTH: 20,
    MAX_LENGTH: 10000,
  },
  UPLOAD_FILE: {
    MAX_SIZE_BYTES: 5 * 1024 * 1024,
    MAX_SIZE_MB: 5,
    ALLOWED_EXTENSIONS: ['.md'],
  },
  SEARCH_QUERY: {
    MAX_LENGTH: 200,
  },
  PAGINATION: {
    PAGE_MIN: 1,
    LIMIT_MIN: 1,
    LIMIT_MAX: 100,
  },
});
