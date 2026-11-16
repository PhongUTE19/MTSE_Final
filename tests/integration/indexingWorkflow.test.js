import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from '../../server/src/config.js';
import { runIndexer } from '../../server/src/features/knowledgeBase/indexer.js';
import {
  getVectorStore,
  getVectorStoreCount,
  searchVectorPoints,
  setQdrantClientForTests,
} from '../../server/src/features/knowledgeBase/vectorStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const knowledgeDir = path.join(projectRoot, 'data', 'knowledge');

function createFakeQdrant({
  initialCollections = {},
  initialAliases = {},
  faults = {},
} = {}) {
  const collections = new Map();
  for (const [name, pts] of Object.entries(initialCollections)) {
    const map = new Map();
    for (const p of pts) map.set(p.id, p);
    collections.set(name, map);
  }
  const aliases = new Map(Object.entries(initialAliases));
  const events = [];

  function resolveCollection(name) {
    if (aliases.has(name)) return aliases.get(name);
    return name;
  }

  return {
    collections,
    aliases,
    events,
    collectionExists: async (name) => {
      const target = resolveCollection(name);
      return { exists: collections.has(target) };
    },
    getCollections: async () => ({
      collections: Array.from(collections.keys()).map((name) => ({ name })),
    }),
    getAliases: async () => ({
      aliases: Array.from(aliases.entries()).map(([alias_name, collection_name]) => ({
        alias_name,
        collection_name,
      })),
    }),
    createCollection: async (name) => {
      events.push(`createCollection:${name}`);
      if (faults.failOnCreateShadow) {
        throw new Error('Simulated shadow collection creation failure');
      }
      if (collections.has(name) || aliases.has(name)) {
        throw new Error(`Collection or alias "${name}" already exists`);
      }
      collections.set(name, new Map());
    },
    deleteCollection: async (name) => {
      events.push(`deleteCollection:${name}`);
      if (faults.failOnDelete && faults.failOnDelete(name)) {
        throw new Error(`Simulated delete failure for ${name}`);
      }
      collections.delete(name);
    },
    upsert: async (name, { points }) => {
      events.push(`upsert:${name}:${points.length}`);
      if (faults.failOnUpsert) {
        // Simulate partial write before failure
        const col = collections.get(name);
        if (col && points.length > 0) col.set(points[0].id, points[0]);
        throw new Error('Simulated partial shadow upsert failure');
      }
      const col = collections.get(name);
      if (!col) throw new Error(`Missing collection ${name}`);
      const toWrite = faults.dropLastPoint ? points.slice(0, -1) : points;
      for (const p of toWrite) {
        col.set(p.id, p);
      }
    },
    count: async (name) => {
      const target = resolveCollection(name);
      const col = collections.get(target);
      return { count: col ? col.size : 0 };
    },
    scroll: async (name) => {
      const target = resolveCollection(name);
      const col = collections.get(target);
      return {
        points: col ? Array.from(col.values()) : [],
        next_page_offset: null,
      };
    },
    query: async (name, { limit = 5 }) => {
      const target = resolveCollection(name);
      const col = collections.get(target);
      if (!col) throw new Error(`Collection ${name} not found`);
      const pts = Array.from(col.values()).slice(0, limit).map((p) => ({ ...p, score: 0.91 }));
      return { points: pts };
    },
    updateCollectionAliases: async ({ actions }) => {
      events.push(`updateAliases:${JSON.stringify(actions)}`);
      if (faults.failOnAliasSwitch) {
        throw new Error('Simulated alias switch failure');
      }
      for (const action of actions) {
        if (action.delete_alias) {
          aliases.delete(action.delete_alias.alias_name);
        }
        if (action.create_alias) {
          const { alias_name, collection_name } = action.create_alias;
          if (collections.has(alias_name)) {
            throw new Error(`Alias "${alias_name}" conflicts with physical collection`);
          }
          aliases.set(alias_name, collection_name);
        }
      }
    },
  };
}

const seedPoints = [
  { id: 1, vector: new Array(config.vectorSize).fill(0.1), payload: { id: 'legacy_1', title: 'Legacy', content: 'Old data', source: 'legacy.md' } },
];

const validEmbedder = async () => new Array(config.vectorSize).fill(0.02);

afterEach(() => {
  setQdrantClientForTests(null);
});

describe('Vector Store Non-Destructive Shadow Re-indexing Integration Suite', () => {
  it('migrates initial physical "spendwise" collection to "spendwise_active" alias and cleans up legacy collection after switch', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { [config.qdrantCollection]: seedPoints },
    });
    setQdrantClientForTests(fakeQdrant);

    const result = await runIndexer({ knowledgeDir, embedder: validEmbedder, client: fakeQdrant });

    assert.equal(result.indexedChunks, 12);
    assert.equal(result.activeAlias, config.qdrantActiveAlias);
    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), result.collectionName);
    assert.equal(fakeQdrant.collections.has(config.qdrantCollection), false, 'Legacy physical collection must be cleaned up after switch');
    assert.equal(await getVectorStoreCount(), 12);

    const searchRes = await searchVectorPoints({ vector: new Array(config.vectorSize).fill(0.02), limit: 3 });
    assert.equal(searchRes.length, 3);

    // Alias switch must precede legacy deletion
    const switchIdx = fakeQdrant.events.findIndex((e) => e.startsWith('updateAliases:'));
    const deleteIdx = fakeQdrant.events.findIndex((e) => e === `deleteCollection:${config.qdrantCollection}`);
    assert.ok(switchIdx !== -1 && deleteIdx !== -1 && switchIdx < deleteIdx);
  });

  it('preserves active collection and creates no shadow collection when embedding fails partway through', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
    });
    setQdrantClientForTests(fakeQdrant);

    let callCount = 0;
    await assert.rejects(
      () => runIndexer({
        knowledgeDir,
        client: fakeQdrant,
        embedder: async () => {
          callCount += 1;
          if (callCount === 4) throw new Error('Simulated embedding API failure');
          return new Array(config.vectorSize).fill(0.02);
        },
      }),
      /Simulated embedding API failure/
    );

    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), 'spendwise_v1');
    assert.equal(fakeQdrant.collections.size, 1);
    assert.equal(await getVectorStoreCount(), 1);
  });

  it('preserves active collection when shadow collection creation fails', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { [config.qdrantCollection]: seedPoints },
      faults: { failOnCreateShadow: true },
    });
    setQdrantClientForTests(fakeQdrant);

    await assert.rejects(
      () => runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder }),
      /Simulated shadow collection creation failure/
    );

    assert.equal(fakeQdrant.collections.has(config.qdrantCollection), true);
    assert.equal(await getVectorStoreCount(), 1);
  });

  it('cleans up partial shadow collection and keeps active collection intact on partial upsert failure', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
      faults: { failOnUpsert: true },
    });
    setQdrantClientForTests(fakeQdrant);

    await assert.rejects(
      () => runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder }),
      /Simulated partial shadow upsert failure/
    );

    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), 'spendwise_v1');
    assert.deepEqual(Array.from(fakeQdrant.collections.keys()), ['spendwise_v1']);
    assert.equal(await getVectorStoreCount(), 1);
  });

  it('cleans up shadow collection and preserves active collection when point verification fails', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
      faults: { dropLastPoint: true },
    });
    setQdrantClientForTests(fakeQdrant);

    await assert.rejects(
      () => runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder }),
      /verification failed: expected 12 points, found 11/
    );

    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), 'spendwise_v1');
    assert.deepEqual(Array.from(fakeQdrant.collections.keys()), ['spendwise_v1']);
    assert.equal(await getVectorStoreCount(), 1);
  });

  it('cleans up unactivated shadow collection and keeps old collection when alias switch fails', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
      faults: { failOnAliasSwitch: true },
    });
    setQdrantClientForTests(fakeQdrant);

    await assert.rejects(
      () => runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder }),
      /Simulated alias switch failure/
    );

    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), 'spendwise_v1');
    assert.deepEqual(Array.from(fakeQdrant.collections.keys()), ['spendwise_v1']);
    assert.equal(await getVectorStoreCount(), 1);
  });

  it('succeeds when old collection cleanup fails after successful alias switch and does not delete active shadow', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
      faults: { failOnDelete: (name) => name === 'spendwise_v1' },
    });
    setQdrantClientForTests(fakeQdrant);

    const result = await runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder });

    assert.equal(result.indexedChunks, 12);
    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), result.collectionName);
    assert.equal(result.cleanupWarnings.length, 1);
    assert.equal(await getVectorStoreCount(), 12);
    assert.ok(fakeQdrant.collections.has(result.collectionName));
  });

  it('recovers and cleans up abandoned shadow collections on retry after an interrupted run', async () => {
    const abandonedShadow = `${config.qdrantCollection}_shadow_abandoned_1`;
    const fakeQdrant = createFakeQdrant({
      initialCollections: {
        spendwise_v1: seedPoints,
        [abandonedShadow]: [],
      },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
    });
    setQdrantClientForTests(fakeQdrant);

    const result = await runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder });

    assert.equal(result.indexedChunks, 12);
    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), result.collectionName);
    assert.equal(fakeQdrant.collections.has('spendwise_v1'), false);
    assert.equal(fakeQdrant.collections.has(abandonedShadow), false);
    assert.deepEqual(Array.from(fakeQdrant.collections.keys()), [result.collectionName]);
  });

  it('rejects concurrent runIndexer calls with 409 Conflict without corrupting active index', async () => {
    const fakeQdrant = createFakeQdrant({
      initialCollections: { spendwise_v1: seedPoints },
      initialAliases: { [config.qdrantActiveAlias]: 'spendwise_v1' },
    });
    setQdrantClientForTests(fakeQdrant);

    let releaseFirstEmbed;
    const firstEmbedGate = new Promise((resolve) => { releaseFirstEmbed = resolve; });
    let firstCall = true;

    const job1 = runIndexer({
      knowledgeDir,
      client: fakeQdrant,
      embedder: async () => {
        if (firstCall) {
          firstCall = false;
          await firstEmbedGate;
        }
        return new Array(config.vectorSize).fill(0.02);
      },
    });

    await assert.rejects(
      () => runIndexer({ knowledgeDir, client: fakeQdrant, embedder: validEmbedder }),
      (err) => err.statusCode === 409
    );

    releaseFirstEmbed();
    const res1 = await job1;
    assert.equal(res1.indexedChunks, 12);
    assert.equal(fakeQdrant.aliases.get(config.qdrantActiveAlias), res1.collectionName);
  });

  it('knowledge vectorStore module exports getVectorStore and getVectorStoreCount', () => {
    assert.equal(typeof getVectorStore, 'function');
    assert.equal(typeof getVectorStoreCount, 'function');
  });
});
