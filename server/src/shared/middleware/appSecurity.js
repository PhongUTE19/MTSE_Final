import { HTTP_STATUS, STATUS_KEYS } from '../../constants/index.js';

const DEFAULT_DEV_CORS_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const DEFAULT_TRUSTED_PROXY_SUBNETS = 'loopback, linklocal, uniquelocal';

/**
 * Resolves Express `trust proxy` setting safely for Nginx/Docker vs direct execution.
 * Never defaults to unrestricted `true`.
 *
 * @param {{ trustProxyEnv?: string, nodeEnv?: string }} [options]
 * @returns {boolean|number|string}
 */
export function resolveTrustProxy({
  trustProxyEnv = process.env.TRUST_PROXY,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const raw = typeof trustProxyEnv === 'string' ? trustProxyEnv.trim() : '';
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower === 'false' || lower === '0') return false;
    if (lower === 'true') {
      // Never allow blind `trust proxy = true`; fall back to private proxy subnets.
      return DEFAULT_TRUSTED_PROXY_SUBNETS;
    }
    if (/^\d+$/.test(raw)) {
      return parseInt(raw, 10);
    }
    return raw;
  }

  return nodeEnv === 'production' ? DEFAULT_TRUSTED_PROXY_SUBNETS : false;
}

/**
 * Parses comma-separated CORS origins, filtering out empty strings and wildcards.
 *
 * @param {string} rawOrigins
 * @returns {string[]}
 */
export function parseCorsOrigins(rawOrigins = '') {
  if (typeof rawOrigins !== 'string' || !rawOrigins.trim()) {
    return [];
  }
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');
}

/**
 * Builds strict CORS middleware options.
 * - Production: allows only origins listed in `CORS_ORIGIN`; fails closed (omits ACAO) if unset.
 * - Development/Test: defaults to explicit localhost dev origins when `CORS_ORIGIN` is unset.
 * - Never enables `credentials: true` with wildcard origins.
 *
 * @param {{ corsOrigin?: string, nodeEnv?: string, onMissingProdConfig?: () => void }} [options]
 */
export function createCorsOptions({
  corsOrigin = process.env.CORS_ORIGIN,
  nodeEnv = process.env.NODE_ENV,
  onMissingProdConfig,
} = {}) {
  const isProd = nodeEnv === 'production';
  const configuredOrigins = parseCorsOrigins(corsOrigin);

  if (isProd && configuredOrigins.length === 0 && typeof onMissingProdConfig === 'function') {
    onMissingProdConfig();
  }

  const allowedOrigins = configuredOrigins.length > 0
    ? new Set(configuredOrigins)
    : (isProd ? new Set() : new Set(DEFAULT_DEV_CORS_ORIGINS));

  return {
    origin(requestOrigin, callback) {
      // Non-browser / same-origin requests without an Origin header are permitted.
      if (!requestOrigin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(requestOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  };
}

/**
 * Creates the `/api/health/live` liveness handler, independent of optional Qdrant availability.
 */
export function createLiveHealthHandler() {
  return (_req, res) => {
    res.json({
      status: STATUS_KEYS.OK,
    });
  };
}

/**
 * Creates the `/api/health` Express handler, masking internal exception details in production.
 *
 * @param {{ getVectorStoreCount: () => Promise<number>, nodeEnv?: string }} deps
 */
export function createHealthHandler({
  getVectorStoreCount,
  nodeEnv = process.env.NODE_ENV,
}) {
  return async (req, res) => {
    try {
      const indexedChunks = await getVectorStoreCount();
      res.json({
        status: STATUS_KEYS.OK,
        indexedChunks,
      });
    } catch (error) {
      console.error('[Server] Health check error:', error?.message || 'Unknown error');
      const isProd = (nodeEnv || process.env.NODE_ENV) === 'production';
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: STATUS_KEYS.ERROR,
        detail: isProd
          ? 'Health check dependency unavailable.'
          : (error?.message || 'Health check failed.'),
      });
    }
  };
}
