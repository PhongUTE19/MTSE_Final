import { VALIDATION_LIMITS } from '../constants/config.js';
import { APP_MESSAGES } from '../constants/messages.js';

const MSG = APP_MESSAGES.VALIDATION;

/**
 * Standard validation result shape.
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string|null} error - User-facing error message or null if valid
 */

/**
 * Validates that a value is not null, undefined, or an empty string.
 *
 * @param {any} value
 * @param {string} [fieldLabel='Field']
 * @returns {ValidationResult}
 */
export function validateRequired(value, fieldLabel = 'Field') {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: MSG.REQUIRED(fieldLabel) };
  }
  return { isValid: true, error: null };
}

/**
 * Validates that a string value is not empty or composed solely of whitespace.
 *
 * @param {any} value
 * @param {string} [fieldLabel='Field']
 * @returns {ValidationResult}
 */
export function validateNonEmpty(value, fieldLabel = 'Field') {
  if (typeof value !== 'string' || !value.trim()) {
    return { isValid: false, error: MSG.REQUIRED(fieldLabel) };
  }
  return { isValid: true, error: null };
}

/**
 * Validates string length boundaries with optional whitespace trimming.
 *
 * @param {string} value
 * @param {object} options
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {string} [options.fieldLabel='Field']
 * @param {boolean} [options.trim=true]
 * @returns {ValidationResult}
 */
export function validateStringLength(value, { min, max, fieldLabel = 'Field', trim = true } = {}) {
  const str = typeof value === 'string' ? (trim ? value.trim() : value) : '';
  const length = str.length;

  if (min !== undefined && length < min) {
    return { isValid: false, error: MSG.MIN_LENGTH(fieldLabel, min) };
  }
  if (max !== undefined && length > max) {
    return { isValid: false, error: MSG.MAX_LENGTH(fieldLabel, max) };
  }

  return { isValid: true, error: null };
}

/**
 * Validates standard email address format.
 *
 * @param {string} value
 * @param {string} [fieldLabel='Email']
 * @returns {ValidationResult}
 */
export function validateEmail(value, fieldLabel = 'Email') {
  const nonEmpty = validateNonEmpty(value, fieldLabel);
  if (!nonEmpty.isValid) return nonEmpty;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value.trim())) {
    return { isValid: false, error: MSG.INVALID_EMAIL };
  }

  return { isValid: true, error: null };
}

/**
 * Validates numeric values and optional range constraints.
 *
 * @param {any} value
 * @param {object} [options]
 * @param {number} [options.min]
 * @param {number} [options.max]
 * @param {boolean} [options.integer=false]
 * @param {string} [options.fieldLabel='Number']
 * @returns {ValidationResult & { value?: number }}
 */
export function validateNumber(value, { min, max, integer = false, fieldLabel = 'Number' } = {}) {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: MSG.REQUIRED(fieldLabel) };
  }

  const num = Number(value);
  if (isNaN(num)) {
    return { isValid: false, error: MSG.INVALID_NUMBER(fieldLabel) };
  }

  if (integer && !Number.isInteger(num)) {
    return { isValid: false, error: MSG.INVALID_NUMBER(fieldLabel) };
  }

  if (min !== undefined && max !== undefined) {
    if (num < min || num > max) {
      return { isValid: false, error: MSG.NUMBER_OUT_OF_RANGE(fieldLabel, min, max) };
    }
  } else if (min !== undefined && num < min) {
    return { isValid: false, error: `${fieldLabel} must be at least ${min}.` };
  } else if (max !== undefined && num > max) {
    return { isValid: false, error: `${fieldLabel} must not exceed ${max}.` };
  }

  return { isValid: true, error: null, value: num };
}

/**
 * Validates standard web URL format (http or https).
 *
 * @param {string} value
 * @param {string} [fieldLabel='URL']
 * @returns {ValidationResult}
 */
export function validateUrl(value, fieldLabel = 'URL') {
  const nonEmpty = validateNonEmpty(value, fieldLabel);
  if (!nonEmpty.isValid) return nonEmpty;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { isValid: false, error: MSG.INVALID_URL };
    }
    return { isValid: true, error: null };
  } catch {
    return { isValid: false, error: MSG.INVALID_URL };
  }
}

/**
 * Validates date string or Date instance.
 *
 * @param {any} value
 * @param {string} [fieldLabel='Date']
 * @returns {ValidationResult & { date?: Date }}
 */
export function validateDate(value, fieldLabel = 'Date') {
  if (!value) {
    return { isValid: false, error: MSG.REQUIRED(fieldLabel) };
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return { isValid: false, error: MSG.INVALID_DATE };
  }

  return { isValid: true, error: null, date: d };
}

/**
 * Validates chronological date boundaries (start <= end).
 *
 * @param {any} startDate
 * @param {any} endDate
 * @returns {ValidationResult}
 */
export function validateDateRange(startDate, endDate) {
  if (startDate) {
    const startVal = validateDate(startDate, 'Start date');
    if (!startVal.isValid) return startVal;
  }
  if (endDate) {
    const endVal = validateDate(endDate, 'End date');
    if (!endVal.isValid) return endVal;
  }

  if (startDate && endDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (start > end) {
      return { isValid: false, error: MSG.INVALID_DATE_RANGE };
    }
  }

  return { isValid: true, error: null };
}

/**
 * Validates an uploaded file's type, extension, and size limits.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {string[]} [options.allowedExtensions]
 * @param {number} [options.maxSizeBytes]
 * @param {string} [options.fieldLabel='File']
 * @returns {ValidationResult}
 */
export function validateFile(file, options = {}) {
  const {
    allowedExtensions = VALIDATION_LIMITS.UPLOAD_FILE.ALLOWED_EXTENSIONS,
    maxSizeBytes = VALIDATION_LIMITS.UPLOAD_FILE.MAX_SIZE_BYTES,
    fieldLabel = 'File',
  } = options;

  if (!file) {
    return { isValid: false, error: MSG.REQUIRED(fieldLabel) };
  }

  const filename = file.name || '';
  const lowerName = filename.toLowerCase();

  if (allowedExtensions.length > 0) {
    const hasValidExt = allowedExtensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
    if (!hasValidExt) {
      return { isValid: false, error: MSG.INVALID_FILE_TYPE };
    }
  }

  if (maxSizeBytes && file.size > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    return { isValid: false, error: MSG.FILE_TOO_LARGE(maxMb) };
  }

  return { isValid: true, error: null };
}

/* ==========================================================================
   Domain-Specific Application Validators
   ========================================================================== */

/**
 * Validates user chat input query message.
 *
 * @param {string} message
 * @returns {ValidationResult & { value?: string }}
 */
export function validateChatMessage(message) {
  const nonEmpty = validateNonEmpty(message, 'Message');
  if (!nonEmpty.isValid) return nonEmpty;

  const trimmed = message.trim();
  const max = VALIDATION_LIMITS.CHAT_MESSAGE.MAX_LENGTH;
  if (trimmed.length > max) {
    return { isValid: false, error: MSG.CHAT_MESSAGE_TOO_LONG(max) };
  }

  return { isValid: true, error: null, value: trimmed };
}

/**
 * Validates knowledge document filename for creation or editing.
 * Enforces .md extension, path-traversal protection, and alphanumeric format.
 *
 * @param {string} filename
 * @returns {ValidationResult & { value?: string }}
 */
export function validateDocumentFilename(filename) {
  const nonEmpty = validateNonEmpty(filename, 'Filename');
  if (!nonEmpty.isValid) return nonEmpty;

  const trimmed = filename.trim();

  // Reject path traversal attempts
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return { isValid: false, error: MSG.PATH_TRAVERSAL_NOT_ALLOWED };
  }

  // Enforce .md extension
  const requiredExt = VALIDATION_LIMITS.DOCUMENT_FILENAME.REQUIRED_EXTENSION;
  const canonicalName = trimmed.endsWith(requiredExt) ? trimmed : `${trimmed}${requiredExt}`;

  // Check length
  const max = VALIDATION_LIMITS.DOCUMENT_FILENAME.MAX_LENGTH;
  if (canonicalName.length > max) {
    return { isValid: false, error: MSG.MAX_LENGTH('Filename', max) };
  }

  // Validate allowed characters (alphanumeric, hyphens, underscores, dots)
  if (!/^[a-zA-Z0-9_\-.]+\.md$/.test(canonicalName)) {
    return { isValid: false, error: MSG.INVALID_FILENAME };
  }

  return { isValid: true, error: null, value: canonicalName };
}

/**
 * Validates knowledge document markdown content.
 * Requires at least one Level-2 section header ('## ').
 *
 * @param {string} content
 * @returns {ValidationResult & { value?: string }}
 */
export function validateDocumentContent(content) {
  const nonEmpty = validateNonEmpty(content, 'Document content');
  if (!nonEmpty.isValid) return nonEmpty;

  const trimmed = content.trim();
  const requiredHeader = VALIDATION_LIMITS.DOCUMENT_CONTENT.REQUIRED_SECTION_HEADER;
  const hasLevel2Header = trimmed.split('\n').some((line) => line.startsWith(requiredHeader));

  if (!hasLevel2Header) {
    return { isValid: false, error: MSG.MISSING_SECTION_HEADER };
  }

  return { isValid: true, error: null, value: trimmed };
}

/**
 * Validates system prompt configuration text.
 * Enforces 20–10,000 character boundaries matching the backend schema.
 *
 * @param {string} prompt
 * @returns {ValidationResult & { value?: string }}
 */
export function validateSystemPrompt(prompt) {
  const nonEmpty = validateNonEmpty(prompt, 'System prompt');
  if (!nonEmpty.isValid) return nonEmpty;

  const trimmed = prompt.trim();
  const min = VALIDATION_LIMITS.SYSTEM_PROMPT.MIN_LENGTH;
  const max = VALIDATION_LIMITS.SYSTEM_PROMPT.MAX_LENGTH;

  if (trimmed.length < min) {
    return { isValid: false, error: MSG.PROMPT_TOO_SHORT(min) };
  }
  if (trimmed.length > max) {
    return { isValid: false, error: MSG.PROMPT_TOO_LONG(max) };
  }

  return { isValid: true, error: null, value: trimmed };
}

/**
 * Validates pagination page and limit parameters.
 *
 * @param {number|string} page
 * @param {number|string} limit
 * @returns {ValidationResult & { page?: number, limit?: number }}
 */
export function validatePagination(page, limit) {
  const pageResult = validateNumber(page, {
    min: VALIDATION_LIMITS.PAGINATION.PAGE_MIN,
    integer: true,
    fieldLabel: 'Page',
  });
  if (!pageResult.isValid) return pageResult;

  const limitResult = validateNumber(limit, {
    min: VALIDATION_LIMITS.PAGINATION.LIMIT_MIN,
    max: VALIDATION_LIMITS.PAGINATION.LIMIT_MAX,
    integer: true,
    fieldLabel: 'Limit',
  });
  if (!limitResult.isValid) return limitResult;

  return {
    isValid: true,
    error: null,
    page: pageResult.value,
    limit: limitResult.value,
  };
}

/**
 * Validates chunk search query length.
 *
 * @param {string} query
 * @returns {ValidationResult & { value?: string }}
 */
export function validateSearchQuery(query) {
  if (!query) {
    return { isValid: true, error: null, value: '' };
  }
  const str = String(query);
  const max = VALIDATION_LIMITS.SEARCH_QUERY.MAX_LENGTH;
  if (str.length > max) {
    return { isValid: false, error: MSG.MAX_LENGTH('Search query', max) };
  }
  return { isValid: true, error: null, value: str };
}
