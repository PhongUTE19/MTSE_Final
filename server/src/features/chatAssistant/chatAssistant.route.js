import express from 'express';
import * as chatAssistantController from './chatAssistant.controller.js';
import { validateRequest, chatRateLimiter, authenticate, authorize } from '../../shared/middleware/index.js';
import { chatAssistantRequestSchema } from './chatAssistant.schema.js';

const router = express.Router();

router.use(authenticate, authorize('user'));

// Standardized Chat Assistant routes (mounted at /api/chat-assistant)
router.post('/', chatRateLimiter, validateRequest({ body: chatAssistantRequestSchema }), chatAssistantController.chat);
router.post('/stream', chatRateLimiter, validateRequest({ body: chatAssistantRequestSchema }), chatAssistantController.chatStream);

export default router;
