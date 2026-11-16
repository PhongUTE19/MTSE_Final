import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../../config.js';
import { SERVER_MESSAGES } from '../../../constants/index.js';

let qdrantClientInstance = null;
let testClientOverride = null;

/**
 * Registers a mock/fake Qdrant client for unit and integration tests.
 * Pass `null` to restore normal client resolution.
 */
export function setQdrantClientForTests(client) {
  testClientOverride = client || null;
}

function getClient() {
  if (testClientOverride) {
    return testClientOverride;
  }
  if (!qdrantClientInstance) {
    if (!config.qdrantUrl) {
      throw new Error(SERVER_MESSAGES.ERRORS.QDRANT_URL_NOT_CONFIGURED);
    }
    qdrantClientInstance = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey || undefined,
      checkCompatibility: false,
    });
  }
  return qdrantClientInstance;
}

function normalizeExists(result) {
  if (typeof result === 'boolean') return result;
  return Boolean(result?.exists);
}

export function getActiveAliasName() {
  return config.qdrantActiveAlias || `${config.qdrantCollection}_active`;
}

export function getShadowPrefix() {
  return `${config.qdrantCollection}_shadow_`;
}

async function listAliases(client) {
  const res = await client.getAliases();
  return Array.isArray(res?.aliases) ? res.aliases : [];
}

async function listCollections(client) {
  const res = await client.getCollections();
  return Array.isArray(res?.collections) ? res.collections.map((c) => c.name) : [];
}

/**
 * Resolves the active readable collection/alias target without mutating Qdrant.
 * Prefers the stable active alias (`spendwise_active`), falling back to the
 * legacy physical collection (`spendwise`) if the alias has not yet been bootstrapped.
 */
async function resolveReadTarget(client) {
  const activeAlias = getActiveAliasName();
  const baseCollection = config.qdrantCollection;

  try {
    const aliases = await listAliases(client);
    if (aliases.some((a) => a.alias_name === activeAlias)) {
      return activeAlias;
    }
  } catch {
    // Fall back to collectionExists check below if getAliases is unavailable
  }

  if (normalizeExists(await client.collectionExists(activeAlias))) {
    return activeAlias;
  }
  if (normalizeExists(await client.collectionExists(baseCollection))) {
    return baseCollection;
  }
  return null;
}

/**
 * Non-destructive startup initialization.
 * - If `spendwise_active` alias already exists, leaves it intact.
 * - If legacy physical `spendwise` exists without the alias, bootstraps `spendwise_active -> spendwise`.
 * - If neither exists (fresh instance), creates an initial versioned physical collection and binds `spendwise_active`.
 */
async function initCollection() {
  const client = getClient();
  const activeAlias = getActiveAliasName();
  const baseCollection = config.qdrantCollection;

  try {
    const aliases = await listAliases(client);
    const existingAlias = aliases.find((a) => a.alias_name === activeAlias);
    if (existingAlias) {
      return client;
    }

    const collections = await listCollections(client);
    if (collections.includes(baseCollection)) {
      await client.updateCollectionAliases({
        actions: [
          { create_alias: { collection_name: baseCollection, alias_name: activeAlias } },
        ],
      });
      return client;
    }

    const initialCollection = `${baseCollection}_init_${Date.now()}`;
    await client.createCollection(initialCollection, {
      vectors: {
        size: config.vectorSize,
        distance: config.vectorDistance,
      },
    });
    await client.updateCollectionAliases({
      actions: [
        { create_alias: { collection_name: initialCollection, alias_name: activeAlias } },
      ],
    });
  } catch (error) {
    console.error(`[VectorStore] Error initializing collection "${activeAlias}":`, error.message);
    throw error;
  }

  return client;
}

async function countPoints(collectionOverride) {
  try {
    const client = getClient();
    const target = collectionOverride || await resolveReadTarget(client);
    if (!target) return 0;
    const result = await client.count(target, { exact: true });
    return result?.count || 0;
  } catch (error) {
    console.warn(`[VectorStore] Warning getting count for "${collectionOverride || getActiveAliasName()}":`, error.message);
    return 0;
  }
}

async function upsertPoints(points, options = {}) {
  const client = getClient();
  const target = options.collectionName || await resolveReadTarget(client) || config.qdrantCollection;
  await client.upsert(target, {
    wait: true,
    points,
  });
}

async function searchPoints({ vector, limit, withPayload = true }) {
  const client = getClient();
  const target = await resolveReadTarget(client);
  if (!target) return [];

  const response = await client.query(target, {
    query: vector,
    limit,
    with_payload: withPayload,
  });
  return response?.points || [];
}

async function createShadowCollection(shadowName, clientOverride) {
  const client = clientOverride || getClient();
  await client.createCollection(shadowName, {
    vectors: {
      size: config.vectorSize,
      distance: config.vectorDistance,
    },
  });
}

async function upsertShadowPoints(shadowName, points, clientOverride) {
  const client = clientOverride || getClient();
  await client.upsert(shadowName, {
    wait: true,
    points,
  });
}

async function verifyShadowCollection(shadowName, expectedIds, clientOverride) {
  const client = clientOverride || getClient();
  const expectedCount = expectedIds.length;
  const countRes = await client.count(shadowName, { exact: true });
  const actualCount = countRes?.count ?? 0;
  if (actualCount !== expectedCount) {
    throw new Error(
      `Shadow collection "${shadowName}" verification failed: expected ${expectedCount} points, found ${actualCount}.`
    );
  }

  if (typeof client.scroll === 'function' && expectedCount > 0) {
    const seenIds = new Set();
    let nextOffset = undefined;
    do {
      const scrollRes = await client.scroll(shadowName, {
        limit: Math.max(expectedCount, 100),
        offset: nextOffset,
        with_payload: false,
        with_vector: false,
      });
      const batch = Array.isArray(scrollRes?.points) ? scrollRes.points : [];
      for (const p of batch) {
        seenIds.add(p.id);
      }
      nextOffset = scrollRes?.next_page_offset ?? null;
    } while (nextOffset !== null && nextOffset !== undefined);

    for (const expectedId of expectedIds) {
      if (!seenIds.has(expectedId)) {
        throw new Error(
          `Shadow collection "${shadowName}" verification failed: missing point ID ${expectedId}.`
        );
      }
    }
  }

  return actualCount;
}

/**
 * Atomically switches the stable active alias (`spendwise_active`) to `shadowName`.
 * Handles initial migration when `spendwise` was a physical collection without an alias.
 */
async function switchActiveAlias(shadowName, clientOverride) {
  const client = clientOverride || getClient();
  const activeAlias = getActiveAliasName();
  const baseCollection = config.qdrantCollection;

  const [aliases, collections] = await Promise.all([
    listAliases(client),
    listCollections(client),
  ]);

  const existingAlias = aliases.find((a) => a.alias_name === activeAlias);
  const previousAliasTarget = existingAlias?.collection_name || null;
  const hasLegacyPhysical = collections.includes(baseCollection);

  const actions = previousAliasTarget
    ? [
        { delete_alias: { alias_name: activeAlias } },
        { create_alias: { collection_name: shadowName, alias_name: activeAlias } },
      ]
    : [
        { create_alias: { collection_name: shadowName, alias_name: activeAlias } },
      ];

  await client.updateCollectionAliases({ actions });

  return {
    activeAlias,
    previousAliasTarget,
    hasLegacyPhysical,
  };
}

/**
 * Safely deletes obsolete physical collections (previous alias target, legacy `spendwise`,
 * and any abandoned shadow collections) ONLY after verifying they are not referenced by `activeAlias`.
 */
async function cleanupObsoleteCollections({ activeShadowName, previousAliasTarget, hasLegacyPhysical }, clientOverride) {
  const client = clientOverride || getClient();
  const activeAlias = getActiveAliasName();
  const shadowPrefix = getShadowPrefix();
  const baseCollection = config.qdrantCollection;
  const warnings = [];

  let currentAliasTarget = activeShadowName;
  try {
    const aliases = await listAliases(client);
    const activeEntry = aliases.find((a) => a.alias_name === activeAlias);
    if (activeEntry?.collection_name) {
      currentAliasTarget = activeEntry.collection_name;
    }
  } catch (err) {
    warnings.push(`Could not re-verify alias before cleanup: ${err.message}`);
  }

  let existingCollections = [];
  try {
    existingCollections = await listCollections(client);
  } catch (err) {
    warnings.push(`Could not list collections for cleanup: ${err.message}`);
    return warnings;
  }

  const candidates = new Set();
  if (previousAliasTarget) candidates.add(previousAliasTarget);
  if (hasLegacyPhysical) candidates.add(baseCollection);
  for (const name of existingCollections) {
    if (name.startsWith(shadowPrefix)) {
      candidates.add(name);
    }
  }

  for (const candidate of candidates) {
    if (!candidate || candidate === activeShadowName || candidate === currentAliasTarget) {
      continue;
    }
    if (!existingCollections.includes(candidate)) {
      continue;
    }
    try {
      await client.deleteCollection(candidate);
    } catch (err) {
      warnings.push(`Failed to delete obsolete collection "${candidate}": ${err.message}`);
    }
  }

  return warnings;
}

async function deleteCollectionSafely(collectionName, clientOverride) {
  const client = clientOverride || getClient();
  try {
    await client.deleteCollection(collectionName);
  } catch (err) {
    console.warn(`[VectorStore] Best-effort cleanup failed for "${collectionName}":`, err.message);
  }
}

export const qdrantVectorAdapter = {
  name: 'qdrant',
  getClient,
  getActiveAliasName,
  initCollection,
  countPoints,
  upsertPoints,
  searchPoints,
  createShadowCollection,
  upsertShadowPoints,
  verifyShadowCollection,
  switchActiveAlias,
  cleanupObsoleteCollections,
  deleteCollectionSafely,
};
