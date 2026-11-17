import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { VECTOR_CONFIG, SERVER_CONFIG_DEFAULTS, RATE_LIMIT_CONFIG } from './constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(serverRoot, '.env') });

const aiProvider = (process.env.AI_PROVIDER || SERVER_CONFIG_DEFAULTS.AI_PROVIDER).toLowerCase().trim();
const embeddingProvider = (process.env.EMBEDDING_PROVIDER || aiProvider).toLowerCase().trim();
const dbProvider = (process.env.DB_PROVIDER || 'supabase').toLowerCase().trim();
const vectorProvider = (process.env.VECTOR_PROVIDER || 'qdrant').toLowerCase().trim();

const geminiModel = process.env.GEMINI_MODEL || SERVER_CONFIG_DEFAULTS.GEMINI_MODEL;
const geminiReceiptModel = process.env.GEMINI_RECEIPT_MODEL || geminiModel;
const embeddingModel = process.env.EMBEDDING_MODEL || SERVER_CONFIG_DEFAULTS.EMBEDDING_MODEL;

const qdrantCollection = process.env.QDRANT_COLLECTION_NAME || SERVER_CONFIG_DEFAULTS.QDRANT_COLLECTION;
const qdrantActiveAlias = process.env.QDRANT_ACTIVE_ALIAS || `${qdrantCollection}_active`;

export const SUPPORTED_AI_PROVIDERS = Object.freeze(['gemini']);
export const SUPPORTED_EMBEDDING_PROVIDERS = Object.freeze(['gemini']);
export const SUPPORTED_DB_PROVIDERS = Object.freeze(['supabase']);
export const SUPPORTED_VECTOR_PROVIDERS = Object.freeze(['qdrant']);

export const config = {
  port: parseInt(process.env.PORT || SERVER_CONFIG_DEFAULTS.DEFAULT_PORT_STR, 10),
  corsOrigin: process.env.CORS_ORIGIN || '',
  trustProxy: process.env.TRUST_PROXY ?? '',
  chatStrategy: (process.env.CHAT_STRATEGY?.trim() || SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY || 'unified').toLowerCase(),

  // AI provider selection & model configuration
  aiProvider,
  embeddingProvider,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel,
  geminiReceiptModel,
  embeddingModel,
  ai: {
    provider: aiProvider,
    embeddingProvider,
    chatModel: geminiModel,
    receiptModel: geminiReceiptModel,
    embeddingModel,
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      chatModel: geminiModel,
      receiptModel: geminiReceiptModel,
      embeddingModel,
    },
    // Future local runtime configuration (no active Ollama adapter in this release)
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      chatModel: process.env.OLLAMA_MODEL || '',
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || '',
    },
  },

  // Vector database & retrieval configuration
  vectorProvider,
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || SERVER_CONFIG_DEFAULTS.DEFAULT_SIMILARITY_THRESHOLD_STR),
  topK: parseInt(process.env.TOP_K || SERVER_CONFIG_DEFAULTS.DEFAULT_TOP_K_STR, 10),
  knowledgeDir: process.env.KNOWLEDGE_DIR || path.join(projectRoot, 'data', 'knowledge'),
  qdrantUrl: process.env.QDRANT_URL || '',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  qdrantCollection,
  qdrantActiveAlias,
  vectorSize: VECTOR_CONFIG.DEFAULT_SIZE,
  vectorDistance: VECTOR_CONFIG.DISTANCE_COSINE,
  vector: {
    provider: vectorProvider,
    qdrant: {
      url: process.env.QDRANT_URL || '',
      apiKey: process.env.QDRANT_API_KEY || '',
      collection: qdrantCollection,
      activeAlias: qdrantActiveAlias,
    },
    size: VECTOR_CONFIG.DEFAULT_SIZE,
    distance: VECTOR_CONFIG.DISTANCE_COSINE,
  },

  // Operational database configuration
  dbProvider,
  supabaseUrl: process.env.SUPABASE_URL || '',
  // The anon key is intentionally separate from the service key. It is used
  // for user-scoped requests so PostgREST evaluates RLS with the caller JWT.
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
  db: {
    provider: dbProvider,
    supabase: {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
    },
    // Future local PostgreSQL configuration (no active pg adapter in this release)
    postgres: {
      connectionString: process.env.DATABASE_URL || '',
    },
  },

  rateLimits: {
    apiMax: parseInt(process.env.RATE_LIMIT_API_MAX || String(RATE_LIMIT_CONFIG.API.MAX), 10),
    apiWindowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || String(RATE_LIMIT_CONFIG.API.WINDOW_MS), 10),
    chatMax: parseInt(process.env.RATE_LIMIT_CHAT_MAX || String(RATE_LIMIT_CONFIG.CHAT.MAX), 10),
    chatWindowMs: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS || String(RATE_LIMIT_CONFIG.CHAT.WINDOW_MS), 10),
    expenseAgentMax: parseInt(process.env.RATE_LIMIT_EXPENSE_AGENT_MAX || String(RATE_LIMIT_CONFIG.EXPENSE_AGENT.MAX), 10),
    expenseAgentWindowMs: parseInt(process.env.RATE_LIMIT_EXPENSE_AGENT_WINDOW_MS || String(RATE_LIMIT_CONFIG.EXPENSE_AGENT.WINDOW_MS), 10),
    receiptOcrMax: parseInt(process.env.RATE_LIMIT_RECEIPT_OCR_MAX || String(RATE_LIMIT_CONFIG.RECEIPT_OCR.MAX), 10),
    receiptOcrWindowMs: parseInt(process.env.RATE_LIMIT_RECEIPT_OCR_WINDOW_MS || String(RATE_LIMIT_CONFIG.RECEIPT_OCR.WINDOW_MS), 10),
    indexingMax: parseInt(process.env.RATE_LIMIT_INDEXING_MAX || String(RATE_LIMIT_CONFIG.INDEXING.MAX), 10),
    indexingWindowMs: parseInt(process.env.RATE_LIMIT_INDEXING_WINDOW_MS || String(RATE_LIMIT_CONFIG.INDEXING.WINDOW_MS), 10),
    signupMax: parseInt(process.env.RATE_LIMIT_SIGNUP_MAX || String(RATE_LIMIT_CONFIG.SIGNUP.MAX), 10),
    signupWindowMs: parseInt(process.env.RATE_LIMIT_SIGNUP_WINDOW_MS || String(RATE_LIMIT_CONFIG.SIGNUP.WINDOW_MS), 10),
  },
};

/**
 * Validates selected provider identifiers at application startup.
 * Fails early with clear errors when an unsupported provider is configured.
 *
 * @param {typeof config} [cfg=config]
 */
export function validateProviderConfig(cfg = config) {
  if (!SUPPORTED_AI_PROVIDERS.includes(cfg.aiProvider)) {
    throw new Error(
      `Invalid AI_PROVIDER "${cfg.aiProvider}". Supported providers: [${SUPPORTED_AI_PROVIDERS.join(', ')}].`
    );
  }
  if (!SUPPORTED_EMBEDDING_PROVIDERS.includes(cfg.embeddingProvider)) {
    throw new Error(
      `Invalid EMBEDDING_PROVIDER "${cfg.embeddingProvider}". Supported providers: [${SUPPORTED_EMBEDDING_PROVIDERS.join(', ')}].`
    );
  }
  if (!SUPPORTED_DB_PROVIDERS.includes(cfg.dbProvider)) {
    throw new Error(
      `Invalid DB_PROVIDER "${cfg.dbProvider}". Supported providers: [${SUPPORTED_DB_PROVIDERS.join(', ')}].`
    );
  }
  if (!SUPPORTED_VECTOR_PROVIDERS.includes(cfg.vectorProvider)) {
    throw new Error(
      `Invalid VECTOR_PROVIDER "${cfg.vectorProvider}". Supported providers: [${SUPPORTED_VECTOR_PROVIDERS.join(', ')}].`
    );
  }
}

/**
 * Inspects startup configuration, distinguishing required credentials from optional integrations.
 * Never returns or logs secret values.
 *
 * @param {typeof config} [cfg=config]
 */
export function inspectStartupConfig(cfg = config) {
  const missingRequired = [];
  const unconfiguredOptional = [];

  if ((cfg.aiProvider === 'gemini' || cfg.embeddingProvider === 'gemini') && !cfg.geminiApiKey) {
    missingRequired.push('GEMINI_API_KEY');
  }
  if (cfg.dbProvider === 'supabase') {
    if (!cfg.supabaseUrl) missingRequired.push('SUPABASE_URL');
    if (!cfg.supabaseAnonKey) missingRequired.push('SUPABASE_ANON_KEY');
    if (!cfg.supabaseServiceKey) missingRequired.push('SUPABASE_SECRET_KEY');
  }

  if (!cfg.qdrantUrl) {
    unconfiguredOptional.push('QDRANT_URL');
  }
  if (!cfg.trustProxy) {
    unconfiguredOptional.push('TRUST_PROXY');
  }
  if (!cfg.corsOrigin && process.env.NODE_ENV !== 'production') {
    unconfiguredOptional.push('CORS_ORIGIN');
  }

  return { missingRequired, unconfiguredOptional };
}

/**
 * Logs concise startup configuration diagnostics without exposing secrets or failing on optional services.
 *
 * @param {typeof config} [cfg=config]
 * @param {Pick<Console, 'info' | 'warn'>} [logger=console]
 */
export function logStartupDiagnostics(cfg = config, logger = console) {
  const result = inspectStartupConfig(cfg);
  if (result.missingRequired.length > 0) {
    logger.warn(`[Startup] Missing required configuration: ${result.missingRequired.join(', ')}`);
  }
  if (result.unconfiguredOptional.length > 0) {
    logger.info(
      `[Startup] Optional configuration not set (using defaults/degraded mode): ${result.unconfiguredOptional.join(', ')}`
    );
  }
  return result;
}
