import express from 'express';
import * as systemPromptController from './systemPrompt.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { updateSystemPromptSchema } from './systemPrompt.schema.js';

const router = express.Router();

// GET /api/admin/prompt
router.get('/', systemPromptController.getPrompt);

// PUT /api/admin/prompt
router.put('/', validateRequest({ body: updateSystemPromptSchema }), systemPromptController.updatePrompt);

// POST /api/admin/prompt/reset
router.post('/reset', systemPromptController.resetPrompt);

export default router;
