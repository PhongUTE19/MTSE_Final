import express from 'express';
import documentRouter from '../features/document/document.route.js';
import systemPromptRouter from '../features/systemPrompt/systemPrompt.route.js';
import knowledgeBaseRouter from '../features/knowledgeBase/knowledgeBase.route.js';
import aiUsageRouter from '../features/aiUsage/aiUsage.route.js';
import { authenticate, authorize } from '../shared/middleware/index.js';

const router = express.Router();

// The administration surface is intentionally protected at its single
// mount point so every nested router has the same trusted identity and role
// requirement. Roles originate only from verified Supabase app_metadata.
router.use(authenticate, authorize('admin'));

// Read-only document listing and inspection (modularized in features/document)
router.use('/document', documentRouter);

// Read-only system prompt inspection (modularized in features/systemPrompt)
router.use('/system-prompt', systemPromptRouter);

// AI usage monitoring (modularized in features/aiUsage)
router.use('/ai-usage', aiUsageRouter);

// Knowledge base management: status, chunks, indexing (modularized in features/knowledgeBase)
router.use('/knowledge-base', knowledgeBaseRouter);

export default router;
