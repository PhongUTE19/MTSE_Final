import { config } from '../../config.js';
import { embedText } from '../../shared/integrations/ai/index.js';
import { searchVectorPoints } from './vectorStore.js';
import { RETRIEVAL_CONFIG } from '../../constants/index.js';


/**
 * Retrieves the Top-K most relevant chunks from the Qdrant vector database for a user query.
 * 
 * @param {string} query - The search query from the user
 * @param {number|Array} param2 - Optional topK number, or legacy chunks array for backward compatibility
 * @param {number} param3 - Optional topK if param2 was legacy chunks array
 * @returns {Promise<Array<{id: string, title: string, content: string, source: string, score: number}>>}
 */
export async function retrieveRelevantChunks(
  query,
  param2 = RETRIEVAL_CONFIG.DEFAULT_TOP_K,
  param3 = RETRIEVAL_CONFIG.DEFAULT_TOP_K
) {
  if (!query || !query.trim()) {
    return [];
  }

  const topK = typeof param2 === 'number'
    ? param2
    : (typeof param3 === 'number' ? param3 : RETRIEVAL_CONFIG.DEFAULT_TOP_K);

  // 1. Generate query embedding vector
  const queryEmbedding = await embedText(query.trim());

  // 2. Query vector store for candidate points using cosine similarity
  const candidateLimit = Math.max(topK, RETRIEVAL_CONFIG.MIN_CANDIDATE_POOL);
  const points = await searchVectorPoints({
    vector: queryEmbedding,
    limit: candidateLimit,
    withPayload: true,
  });

  // 3. Map to clean chunk results
  const candidates = points.map((p) => ({
    id: p.payload?.id || String(p.id),
    sectionNumber: p.payload?.sectionNumber ?? null,
    sectionTitle: p.payload?.sectionTitle || '',
    title: p.payload?.title || '',
    content: p.payload?.content || '',
    source: p.payload?.source || '',
    score: Number(p.score.toFixed(RETRIEVAL_CONFIG.SCORE_PRECISION)),
  }));

  if (candidates.length === 0) {
    return [];
  }

  // Primary topK slice
  let selected = candidates.slice(0, topK);

  // General Amendment-Aware Grounding:
  // If an amendments section exists in the candidate pool with relevant similarity,
  // ensure it is included so the model evaluates overrides alongside original policy sections.
  const amendmentChunk = candidates.find(
    (c) =>
      (c.title?.toLowerCase().includes('amendment') ||
        c.sectionTitle?.toLowerCase().includes('amendment')) &&
      c.score >= RETRIEVAL_CONFIG.AMENDMENT_SCORE_THRESHOLD
  );

  if (amendmentChunk && !selected.some((c) => c.id === amendmentChunk.id)) {
    selected.push(amendmentChunk);
  }

  return selected;
}
