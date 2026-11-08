import express from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { expenseAssistantRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { expenseAssistantRequestSchema } from './expenseAssistant.schema.js';
import * as controller from './expenseAssistant.controller.js';

const router = express.Router();
router.use(authenticate);
router.post('/', expenseAssistantRateLimiter, validateRequest({ body: expenseAssistantRequestSchema }), controller.assistant);
router.post('/search', expenseAssistantRateLimiter, validateRequest({ body: expenseAssistantRequestSchema }), controller.search);
router.post('/summary', expenseAssistantRateLimiter, validateRequest({ body: expenseAssistantRequestSchema }), controller.summary);
router.post('/proposals', expenseAssistantRateLimiter, validateRequest({ body: expenseAssistantRequestSchema }), controller.createProposal);

export default router;
