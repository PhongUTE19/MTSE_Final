import express from 'express';
import * as assistantController from './assistant.controller.js';
import { validateRequest, chatRateLimiter, optionalAuthenticate } from '../../shared/middleware/index.js';
import { assistantRequestSchema } from './assistant.schemas.js';

const router = express.Router();

// Standard Assistant and Chat route bindings
router.post('/chat', optionalAuthenticate, chatRateLimiter, validateRequest({ body: assistantRequestSchema }), assistantController.chat);
router.post('/chat/stream', optionalAuthenticate, chatRateLimiter, validateRequest({ body: assistantRequestSchema }), assistantController.chatStream);

router.post('/', optionalAuthenticate, chatRateLimiter, validateRequest({ body: assistantRequestSchema }), assistantController.chat);
router.post('/stream', optionalAuthenticate, chatRateLimiter, validateRequest({ body: assistantRequestSchema }), assistantController.chatStream);

export default router;
