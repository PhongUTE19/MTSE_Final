import express from 'express';
import * as knowledgeController from './knowledgeBase.controller.js';
import { validateRequest, indexingRateLimiter } from '../../shared/middleware/index.js';
import { paginationQuerySchema } from './knowledgeBase.schema.js';

const router = express.Router();

// GET /api/admin/knowledge/status
router.get('/status', knowledgeController.getStatus);

// GET /api/admin/knowledge/chunks
router.get('/chunks', validateRequest({ query: paginationQuerySchema }), knowledgeController.getChunks);

// POST /api/admin/knowledge/index
router.post('/index', indexingRateLimiter, knowledgeController.triggerIndexing);


export default router;
