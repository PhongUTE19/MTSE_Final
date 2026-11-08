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
  CHAT_ASSISTANT: '/api/chat-assistant',
  ADMIN_KNOWLEDGE_STATUS: '/api/admin/knowledge-base/status',
  ADMIN_DOCUMENTS: '/api/admin/document',
  ADMIN_KNOWLEDGE_CHUNKS: '/api/admin/knowledge-base/chunks',
  ADMIN_KNOWLEDGE_INDEX: '/api/admin/knowledge-base/index',
  ADMIN_SYSTEM_PROMPT: '/api/admin/system-prompt',
  ADMIN_SYSTEM_PROMPT_RESET: '/api/admin/system-prompt/reset',
  ADMIN_AI_USAGE_OVERVIEW: '/api/admin/ai-usage/overview',
  ADMIN_AI_USAGE_TIMESERIES: '/api/admin/ai-usage/timeseries',
  ADMIN_AI_USAGE_BREAKDOWN: '/api/admin/ai-usage/breakdown',
  ADMIN_AI_USAGE_HISTORY: '/api/admin/ai-usage/history',
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
