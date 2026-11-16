export {
  getVectorStore,
  initVectorStore,
  getVectorStoreCount,
  upsertVectorPoints,
  searchVectorPoints,
  createShadowCollection,
  upsertShadowPoints,
  verifyShadowCollection,
  switchActiveAlias,
  cleanupObsoleteCollections,
  deleteVectorCollectionSafely,
  setQdrantClientForTests,
} from '../../shared/integrations/vector/index.js';
