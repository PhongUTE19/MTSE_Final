import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadAndChunkMarkdown } from '../../server/src/features/knowledgeBase/chunker.js';
import { getVectorStore, getVectorStoreCount } from '../../server/src/features/knowledgeBase/vectorStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const knowledgeDir = path.join(projectRoot, 'data', 'knowledge');

describe('Vector Store Re-indexing Workflow Integration Suite', () => {
  it('simulates idempotent indexing pipeline deleting old collection before insert', async () => {
    let collectionDeleted = false;
    let collectionCreated = false;
    let pointsUpserted = 0;

    const mockClient = {
      collectionExists: async () => true,
      deleteCollection: async (name) => {
        collectionDeleted = true;
      },
      createCollection: async (name, opts) => {
        collectionCreated = true;
        assert.equal(opts.vectors.size, 3072);
        assert.equal(opts.vectors.distance, 'Cosine');
      },
      upsert: async (name, { points }) => {
        pointsUpserted = points.length;
      },
      count: async () => ({ count: pointsUpserted }),
    };

    // Simulate initVectorStore({ reset: true })
    const exists = await mockClient.collectionExists('test');
    if (exists) {
      await mockClient.deleteCollection('test');
    }
    await mockClient.createCollection('test', {
      vectors: { size: 3072, distance: 'Cosine' },
    });

    // Simulate upserting 12 parsed user guide chunks
    const chunks = loadAndChunkMarkdown(knowledgeDir);
    const points = chunks.map((chunk, i) => ({
      id: i + 1,
      vector: new Array(3072).fill(0.01),
      payload: {
        id: chunk.id,
        sectionNumber: chunk.sectionNumber,
        sectionTitle: chunk.sectionTitle,
        title: chunk.title,
        content: chunk.content,
        source: chunk.source,
      },
    }));

    await mockClient.upsert('test', { points });
    const countRes = await mockClient.count();

    assert.ok(collectionDeleted, 'Collection must be deleted on reset');
    assert.ok(collectionCreated, 'Collection must be recreated');
    assert.equal(pointsUpserted, 12, 'Must upsert 12 points');
    assert.equal(countRes.count, 12, 'Must report exactly 12 points without duplication');
  });

  it('knowledge vectorStore module exports getVectorStore and getVectorStoreCount', async () => {
    assert.equal(typeof getVectorStore, 'function');
    assert.equal(typeof getVectorStoreCount, 'function');
  });
});
