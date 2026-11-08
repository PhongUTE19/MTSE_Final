import * as knowledgeService from './knowledgeBase.service.js';
import { paginationQuerySchema } from './knowledgeBase.schema.js';
import { getValidatedData } from '../../shared/middleware/index.js';


/**
 * GET /api/admin/status
 */
export async function getStatus(req, res, next) {
  try {
    const status = await knowledgeService.getKnowledgeStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/chunks
 */
export async function getChunks(req, res, next) {
  try {
    const params = getValidatedData(res, 'query', paginationQuerySchema, req.query);
    const result = await knowledgeService.getPaginatedChunks(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/index
 */
export async function triggerIndexing(req, res, next) {
  try {
    const result = await knowledgeService.executeIndexing();
    res.json({
      success: true,
      message: result.message,
      indexedChunks: result.indexedChunks,
    });
  } catch (error) {
    next(error);
  }
}
