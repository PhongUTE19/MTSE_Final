import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { VECTOR_CONFIG, SERVER_CONFIG_DEFAULTS, CHUNKING_CONFIG, RATE_LIMIT_CONFIG } from './constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

export const config = {
  port: parseInt(process.env.PORT || SERVER_CONFIG_DEFAULTS.DEFAULT_PORT_STR, 10),
  chatStrategy: (process.env.CHAT_STRATEGY || SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY || 'agent').toLowerCase(),
  aiProvider: (process.env.AI_PROVIDER || SERVER_CONFIG_DEFAULTS.AI_PROVIDER).toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || SERVER_CONFIG_DEFAULTS.GEMINI_MODEL,
  geminiReceiptModel: process.env.GEMINI_RECEIPT_MODEL || process.env.GEMINI_MODEL || SERVER_CONFIG_DEFAULTS.GEMINI_MODEL,
  embeddingModel: process.env.EMBEDDING_MODEL || SERVER_CONFIG_DEFAULTS.EMBEDDING_MODEL,
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || SERVER_CONFIG_DEFAULTS.DEFAULT_SIMILARITY_THRESHOLD_STR),
  topK: parseInt(process.env.TOP_K || SERVER_CONFIG_DEFAULTS.DEFAULT_TOP_K_STR, 10),
  knowledgeDir: process.env.KNOWLEDGE_DIR || path.join(projectRoot, 'data', 'knowledge'),
  qdrantUrl: process.env.QDRANT_URL || '',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  qdrantCollection: process.env.QDRANT_COLLECTION_NAME || SERVER_CONFIG_DEFAULTS.QDRANT_COLLECTION,
  promptFile: process.env.PROMPT_FILE || path.join(projectRoot, 'data', 'prompts', 'system_prompt.txt'),
  promptFileDefault: process.env.PROMPT_FILE_DEFAULT || path.join(projectRoot, 'data', 'prompts', 'system_prompt_default.txt'),
  vectorSize: VECTOR_CONFIG.DEFAULT_SIZE,
  vectorDistance: VECTOR_CONFIG.DISTANCE_COSINE,
  supabaseUrl: process.env.SUPABASE_URL || '',
  // The anon key is intentionally separate from the service key.  It is used
  // for user-scoped requests so PostgREST evaluates RLS with the caller JWT.
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
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
  },
};

