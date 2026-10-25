import express from 'express';
import * as chatController from './chat.controller.js';
import { validateRequest, chatRateLimiter, optionalAuthenticate } from '../../shared/middleware/index.js';
import { chatRequestSchema } from './chat.schemas.js';

const router = express.Router();

// POST /api/user/chat
router.post('/chat', optionalAuthenticate, chatRateLimiter, validateRequest({ body: chatRequestSchema }), chatController.chat);

// POST /api/user/chat/stream
router.post('/chat/stream', optionalAuthenticate, chatRateLimiter, validateRequest({ body: chatRequestSchema }), chatController.chatStream);

export default router;
