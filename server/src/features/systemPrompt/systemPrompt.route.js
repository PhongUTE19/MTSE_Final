import express from 'express';
import * as systemPromptController from './systemPrompt.controller.js';

const router = express.Router();

// GET /api/admin/system-prompt (read-only canonical prompt)
router.get('/', systemPromptController.getPrompt);

export default router;
