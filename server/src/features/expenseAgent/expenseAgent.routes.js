import express from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { expenseAgentRequestSchema } from './expenseAgent.schemas.js';
import * as controller from './expenseAgent.controller.js';

const router = express.Router();
router.use(authenticate);
router.post('/search', validateRequest({ body: expenseAgentRequestSchema }), controller.search);
router.post('/summary', validateRequest({ body: expenseAgentRequestSchema }), controller.summary);
export default router;
