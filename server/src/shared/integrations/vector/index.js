import { config } from '../../../config.js';
import { qdrantVectorAdapter, setQdrantClientForTests } from './qdrantAdapter.js';

const vectorProviders = new Map([
  ['qdrant', qdrantVectorAdapter],
]);

export function registerVectorProvider(name, adapter) {
  if (!name || typeof name !== 'string') {
    throw new Error('Vector provider name must be a non-empty string.');
  }
  vectorProviders.set(name.toLowerCase().trim(), adapter);
}

export function getVectorProvider(providerName) {
  const target = (providerName || config.vectorProvider || 'qdrant').toLowerCase().trim();
  const provider = vectorProviders.get(target);
  if (!provider) {
    const available = Array.from(vectorProviders.keys()).join(', ');
    throw new Error(`Unsupported vector provider: "${target}". Available providers: [${available}]`);
  }
  return provider;
}

export function getVectorStore(providerName) {
  return getVectorProvider(providerName).getClient();
}

export async function initVectorStore(options = {}) {
  return getVectorProvider(options.provider).initCollection(options);
}

export async function getVectorStoreCount(providerName) {
  return getVectorProvider(providerName).countPoints();
}

export async function upsertVectorPoints(points, options = {}) {
  return getVectorProvider(options.provider).upsertPoints(points, options);
}

export async function searchVectorPoints(params, options = {}) {
  return getVectorProvider(options.provider).searchPoints(params);
}

export async function createShadowCollection(shadowName, options = {}) {
  return getVectorProvider(options.provider).createShadowCollection(shadowName, options.client);
}

export async function upsertShadowPoints(shadowName, points, options = {}) {
  return getVectorProvider(options.provider).upsertShadowPoints(shadowName, points, options.client);
}

export async function verifyShadowCollection(shadowName, expectedIds, options = {}) {
  return getVectorProvider(options.provider).verifyShadowCollection(shadowName, expectedIds, options.client);
}

export async function switchActiveAlias(shadowName, options = {}) {
  return getVectorProvider(options.provider).switchActiveAlias(shadowName, options.client);
}

export async function cleanupObsoleteCollections(cleanupContext, options = {}) {
  return getVectorProvider(options.provider).cleanupObsoleteCollections(cleanupContext, options.client);
}

export async function deleteVectorCollectionSafely(collectionName, options = {}) {
  return getVectorProvider(options.provider).deleteCollectionSafely(collectionName, options.client);
}

export { setQdrantClientForTests };
