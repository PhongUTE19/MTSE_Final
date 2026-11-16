import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config.js';
import { HTTP_STATUS, SERVER_MESSAGES } from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';
import { loadAndChunkMarkdown } from './chunker.js';
import { embedText } from '../../shared/integrations/ai/index.js';
import {
  createShadowCollection,
  upsertShadowPoints,
  verifyShadowCollection,
  switchActiveAlias,
  cleanupObsoleteCollections,
  deleteVectorCollectionSafely,
} from './vectorStore.js';

let isIndexerRunning = false;

function validateEmbedding(embedding, expectedSize, chunkId) {
  if (!Array.isArray(embedding) || embedding.length !== expectedSize) {
    throw new Error(
      `Invalid embedding dimension for chunk "${chunkId}": expected ${expectedSize}, got ${Array.isArray(embedding) ? embedding.length : typeof embedding}.`
    );
  }
  for (let j = 0; j < embedding.length; j++) {
    if (typeof embedding[j] !== 'number' || !Number.isFinite(embedding[j])) {
      throw new Error(`Invalid non-finite embedding value at index ${j} for chunk "${chunkId}".`);
    }
  }
}

function validateChunkPayload(chunk) {
  if (!chunk?.id || !chunk?.title || !chunk?.content || !chunk?.source) {
    throw new Error(`Invalid chunk payload: missing required fields for chunk "${chunk?.id || 'unknown'}".`);
  }
}

/**
 * Indexes all canonical markdown knowledge files using a non-destructive shadow collection:
 * 1. Read & chunk documents, generate & validate all embeddings before touching Qdrant.
 * 2. Create a uniquely named shadow collection.
 * 3. Populate the shadow collection.
 * 4. Verify all expected points exist in the shadow collection.
 * 5. Atomically switch the stable active alias to the shadow collection.
 * 6. Clean up obsolete physical collections only after successful activation.
 *
 * @param {object} [options]
 * @param {string} [options.knowledgeDir] - Optional override for knowledge directory
 * @param {Function} [options.embedder] - Optional override for embedding generator
 * @param {object} [options.client] - Optional Qdrant client override (for tests)
 * @param {string} [options.provider] - Optional vector provider override
 */
export async function runIndexer(options = {}) {
  if (isIndexerRunning) {
    throw new AppError(
      SERVER_MESSAGES.ERRORS.INDEXING_IN_PROGRESS || 'Knowledge base re-indexing is already in progress.',
      HTTP_STATUS.CONFLICT
    );
  }

  isIndexerRunning = true;
  let shadowName = null;
  let shadowCreated = false;
  let aliasSwitched = false;

  try {
    const knowledgeDir = options.knowledgeDir || config.knowledgeDir;
    const embedFn = options.embedder || embedText;
    const vectorOptions = {
      provider: options.provider,
      client: options.client,
    };

    console.log(`[Indexer] Reading knowledge documents from: ${knowledgeDir}`);
    const chunks = loadAndChunkMarkdown(knowledgeDir);
    console.log(`[Indexer] Found ${chunks.length} sections to index.`);

    if (chunks.length === 0) {
      console.warn('[Indexer] Warning: No chunks found to index.');
      return { indexedChunks: 0, activeAlias: config.qdrantActiveAlias, collectionName: null, cleanupWarnings: [] };
    }

    // Generate and validate all embeddings & payloads before creating any Qdrant collection
    const points = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      validateChunkPayload(chunk);
      console.log(`[Indexer] (${i + 1}/${chunks.length}) Embedding: [${chunk.source}] ${chunk.title}`);
      const textToEmbed = `${chunk.title}\n${chunk.content}`;
      const embedding = await embedFn(textToEmbed);
      validateEmbedding(embedding, config.vectorSize, chunk.id);

      points.push({
        id: i + 1,
        vector: embedding,
        payload: {
          id: chunk.id,
          sectionNumber: chunk.sectionNumber,
          sectionTitle: chunk.sectionTitle,
          title: chunk.title,
          content: chunk.content,
          source: chunk.source,
        },
      });
    }

    shadowName = `${config.qdrantCollection}_shadow_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    console.log(`[Indexer] Creating shadow collection "${shadowName}"...`);
    await createShadowCollection(shadowName, vectorOptions);
    shadowCreated = true;

    console.log(`[Indexer] Upserting ${points.length} points into shadow collection "${shadowName}"...`);
    await upsertShadowPoints(shadowName, points, vectorOptions);

    const expectedIds = points.map((p) => p.id);
    const verifiedCount = await verifyShadowCollection(shadowName, expectedIds, vectorOptions);
    console.log(`[Indexer] Verified ${verifiedCount} points in shadow collection "${shadowName}".`);

    const switchResult = await switchActiveAlias(shadowName, vectorOptions);
    aliasSwitched = true;
    console.log(`[Indexer] Switched alias "${switchResult.activeAlias}" -> "${shadowName}".`);

    let cleanupWarnings = [];
    try {
      cleanupWarnings = await cleanupObsoleteCollections(
        {
          activeShadowName: shadowName,
          previousAliasTarget: switchResult.previousAliasTarget,
          hasLegacyPhysical: switchResult.hasLegacyPhysical,
        },
        vectorOptions
      );
    } catch (cleanupError) {
      cleanupWarnings = [`Cleanup failed after activation: ${cleanupError.message}`];
    }

    if (cleanupWarnings.length > 0) {
      console.warn('[Indexer] Post-activation cleanup warnings:', cleanupWarnings);
    }

    return {
      indexedChunks: verifiedCount,
      activeAlias: switchResult.activeAlias,
      collectionName: shadowName,
      previousCollection: switchResult.previousAliasTarget || (switchResult.hasLegacyPhysical ? config.qdrantCollection : null),
      cleanupWarnings,
    };
  } catch (error) {
    if (shadowCreated && !aliasSwitched && shadowName) {
      await deleteVectorCollectionSafely(shadowName, {
        provider: options.provider,
        client: options.client,
      });
    }
    throw error;
  } finally {
    isIndexerRunning = false;
  }
}

// Allow running directly via CLI (e.g., `node src/features/knowledgeBase/indexer.js`)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  runIndexer().catch((err) => {
    console.error('[Indexer] Fatal error during indexing:', err.message);
    process.exit(1);
  });
}
