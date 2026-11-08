import fs from 'fs';
import { config } from '../../config.js';
import { loadAndChunkMarkdown } from './chunker.js';
import { runIndexer } from './indexer.js';
import { getVectorStoreCount } from './vectorStore.js';
import {
  SERVER_MESSAGES,
  HTTP_STATUS,
  PAGINATION_LIMITS,
} from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';

let isIndexing = false;
let lastIndexedAt = null;

export class KnowledgeServiceError extends AppError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

export class AdminServiceError extends KnowledgeServiceError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

/**
 * Computes current system status, file count, chunk count, and cloud sync status.
 * Coordinates knowledge base file inspection and vector store synchronization state.
 * 
 * @returns {Promise<{
 *   documentCount: number,
 *   totalFileChunks: number,
 *   indexedChunks: number,
 *   isIndexing: boolean,
 *   lastIndexedAt: string | null,
 *   isSynced: boolean
 * }>}
 */
export async function getKnowledgeStatus() {
  const files = fs.existsSync(config.knowledgeDir)
    ? fs.readdirSync(config.knowledgeDir).filter((f) => f.endsWith('.md'))
    : [];

  let totalFileChunks = 0;
  try {
    const chunks = loadAndChunkMarkdown(config.knowledgeDir);
    totalFileChunks = chunks.length;
  } catch {
    totalFileChunks = 0;
  }

  const indexedChunks = await getVectorStoreCount();

  return {
    documentCount: files.length,
    totalFileChunks,
    indexedChunks,
    isIndexing,
    lastIndexedAt,
    isSynced: totalFileChunks === indexedChunks && totalFileChunks > 0,
  };
}

/**
 * Returns parsed chunks with pagination and keyword filtering.
 * 
 * @param {object} params
 * @param {number|string} [params.limit=10]
 * @param {number|string} [params.offset=0]
 * @param {string} [params.search='']
 * @returns {Promise<{
 *   totalChunks: number,
 *   chunks: Array<object>,
 *   limit: number,
 *   offset: number,
 *   hasMore: boolean
 * }>}
 */
export async function getPaginatedChunks({
  limit = PAGINATION_LIMITS.DEFAULT_LIMIT,
  offset = PAGINATION_LIMITS.DEFAULT_OFFSET,
  search = '',
}) {
  const rawChunks = loadAndChunkMarkdown(config.knowledgeDir);

  let parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < PAGINATION_LIMITS.MIN_LIMIT) {
    parsedLimit = PAGINATION_LIMITS.DEFAULT_LIMIT;
  } else if (parsedLimit > PAGINATION_LIMITS.MAX_LIMIT) {
    parsedLimit = PAGINATION_LIMITS.MAX_LIMIT;
  }

  let parsedOffset = parseInt(offset, 10);
  if (isNaN(parsedOffset) || parsedOffset < PAGINATION_LIMITS.DEFAULT_OFFSET) {
    parsedOffset = PAGINATION_LIMITS.DEFAULT_OFFSET;
  }

  const query = (search || '').trim().toLowerCase();
  let filteredChunks = rawChunks;
  if (query) {
    filteredChunks = rawChunks.filter((chunk) => {
      return (
        chunk.id.toLowerCase().includes(query) ||
        chunk.title.toLowerCase().includes(query) ||
        (chunk.sectionTitle && chunk.sectionTitle.toLowerCase().includes(query)) ||
        chunk.source.toLowerCase().includes(query) ||
        chunk.content.toLowerCase().includes(query)
      );
    });
  }

  const totalChunks = filteredChunks.length;
  const paginatedChunks = filteredChunks.slice(parsedOffset, parsedOffset + parsedLimit);
  const hasMore = parsedOffset + paginatedChunks.length < totalChunks;

  return {
    totalChunks,
    chunks: paginatedChunks,
    limit: parsedLimit,
    offset: parsedOffset,
    hasMore,
  };
}

/**
 * Executes re-indexing of knowledge chunks to Qdrant Cloud.
 * Guards against concurrent indexing operations.
 * 
 * @returns {Promise<{ message: string, indexedChunks: number }>}
 */
export async function executeIndexing() {
  if (isIndexing) {
    throw new AdminServiceError(SERVER_MESSAGES.ERRORS.INDEXING_IN_PROGRESS, HTTP_STATUS.CONFLICT);
  }

  isIndexing = true;
  try {
    console.log('[KnowledgeService] Re-indexing triggered from Admin interface...');
    const result = await runIndexer();
    lastIndexedAt = new Date().toISOString();
    return {
      message: SERVER_MESSAGES.SUCCESS.INDEXING_COMPLETED(result.indexedChunks),
      indexedChunks: result.indexedChunks,
    };
  } finally {
    isIndexing = false;
  }
}
