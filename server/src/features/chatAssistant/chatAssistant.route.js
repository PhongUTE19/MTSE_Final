import express from 'express';
import * as chatAssistantController from './chatAssistant.controller.js';
import { validateRequest, chatRateLimiter, optionalAuthenticate } from '../../shared/middleware/index.js';
import { chatAssistantRequestSchema } from './chatAssistant.schema.js';

const router = express.Router();

// Standardized Chat Assistant routes (mounted at /api/chat-assistant)
router.post('/', optionalAuthenticate, chatRateLimiter, validateRequest({ body: chatAssistantRequestSchema }), chatAssistantController.chat);
router.post('/stream', optionalAuthenticate, chatRateLimiter, validateRequest({ body: chatAssistantRequestSchema }), chatAssistantController.chatStream);

export default router;
