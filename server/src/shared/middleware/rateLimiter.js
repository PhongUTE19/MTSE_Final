import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { HTTP_STATUS, RATE_LIMIT_CONFIG } from '../../constants/index.js';
import { config } from '../../config.js';

/**
 * Resolves the rate-limiting key for a request.
 * Prioritizes authenticated user IDs (`user:<id>`) so each user receives their own
 * dedicated quota regardless of their IP, falling back to the caller's IP.
 *
 * @param {import('express').Request} req - Express request
 * @returns {string} Unique client key for rate-limiting
 */
export function resolveRateLimitKey(req) {
  if (req?.user?.id) {
    return `user:${req.user.id}`;
  }
  const clientIp = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
  return ipKeyGenerator(clientIp);
}

/**
 * Creates a rate limiter instance with standardized error format and test-environment bypass.
 *
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests allowed per window per key
 * @param {string} options.message - Human-readable error message
 * @param {((req: import('express').Request) => boolean)} [options.skip] - Optional custom skip function
 * @param {((req: import('express').Request) => string)} [options.keyGenerator] - Optional custom key generator
 * @returns {import('express').RequestHandler}
 */
export function createLimiter({
  windowMs,
  max,
  message,
  skip = (req, res) => process.env.NODE_ENV === 'test' || typeof res?.setHeader !== 'function',
  keyGenerator = resolveRateLimitKey,
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator,
    handler: (req, res) => {
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        error: message,
      });
    },
  });
}

/**
 * General API rate limiter for standard endpoints.
 * Configurable via RATE_LIMIT_API_MAX (default: 300 req / 15 min).
 */
export const apiRateLimiter = createLimiter({
  windowMs: config?.rateLimits?.apiWindowMs ?? RATE_LIMIT_CONFIG.API.WINDOW_MS,
  max: config?.rateLimits?.apiMax ?? RATE_LIMIT_CONFIG.API.MAX,
  message: RATE_LIMIT_CONFIG.API.MESSAGE,
});

/**
 * Rate limiter for expensive Handbook AI chat and streaming endpoints.
 * Configurable via RATE_LIMIT_CHAT_MAX (default: 30 req / min).
 */
export const chatRateLimiter = createLimiter({
  windowMs: config?.rateLimits?.chatWindowMs ?? RATE_LIMIT_CONFIG.CHAT.WINDOW_MS,
  max: config?.rateLimits?.chatMax ?? RATE_LIMIT_CONFIG.CHAT.MAX,
  message: RATE_LIMIT_CONFIG.CHAT.MESSAGE,
});

/**
 * Dedicated rate limiter for Expense Agent AI operations (search, summary, assistant, proposal).
 * Configurable via RATE_LIMIT_EXPENSE_AGENT_MAX (default: 30 req / min).
 * Kept separate from chatRateLimiter to prevent cross-feature quota exhaustion.
 */
export const expenseAgentRateLimiter = createLimiter({
  windowMs: config?.rateLimits?.expenseAgentWindowMs ?? RATE_LIMIT_CONFIG.EXPENSE_AGENT.WINDOW_MS,
  max: config?.rateLimits?.expenseAgentMax ?? RATE_LIMIT_CONFIG.EXPENSE_AGENT.MAX,
  message: RATE_LIMIT_CONFIG.EXPENSE_AGENT.MESSAGE,
});

/**
 * Dedicated rate limiter for multimodal Receipt OCR extraction and retry endpoints.
 * Configurable via RATE_LIMIT_RECEIPT_OCR_MAX (default: 15 req / min).
 * Protects vision OCR processing against burst uploads.
 */
export const receiptOcrRateLimiter = createLimiter({
  windowMs: config?.rateLimits?.receiptOcrWindowMs ?? RATE_LIMIT_CONFIG.RECEIPT_OCR.WINDOW_MS,
  max: config?.rateLimits?.receiptOcrMax ?? RATE_LIMIT_CONFIG.RECEIPT_OCR.MAX,
  message: RATE_LIMIT_CONFIG.RECEIPT_OCR.MESSAGE,
});

/**
 * Rate limiter for expensive knowledge re-indexing endpoints.
 * Configurable via RATE_LIMIT_INDEXING_MAX (default: 10 req / 15 min).
 */
export const indexingRateLimiter = createLimiter({
  windowMs: config?.rateLimits?.indexingWindowMs ?? RATE_LIMIT_CONFIG.INDEXING.WINDOW_MS,
  max: config?.rateLimits?.indexingMax ?? RATE_LIMIT_CONFIG.INDEXING.MAX,
  message: RATE_LIMIT_CONFIG.INDEXING.MESSAGE,
});
