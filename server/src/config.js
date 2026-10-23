import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { VECTOR_CONFIG, SERVER_CONFIG_DEFAULTS, CHUNKING_CONFIG } from './constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(serverRoot, '.env') });

export const config = {
  port: parseInt(process.env.PORT || SERVER_CONFIG_DEFAULTS.DEFAULT_PORT_STR, 10),
  aiProvider: (process.env.AI_PROVIDER || SERVER_CONFIG_DEFAULTS.AI_PROVIDER).toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || SERVER_CONFIG_DEFAULTS.GEMINI_MODEL,
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
  supabaseServiceKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY || '',
};

