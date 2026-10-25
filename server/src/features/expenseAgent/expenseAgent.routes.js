import express from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { expenseAgentRequestSchema, proposalConfirmSchema, proposalIdSchema } from './expenseAgent.schemas.js';
import * as controller from './expenseAgent.controller.js';

const router = express.Router();
router.use(authenticate);
router.post('/search', validateRequest({ body: expenseAgentRequestSchema }), controller.search);
router.post('/summary', validateRequest({ body: expenseAgentRequestSchema }), controller.summary);
router.post('/assistant', validateRequest({ body: expenseAgentRequestSchema }), controller.assistant);
router.post('/create-proposal', validateRequest({ body: expenseAgentRequestSchema }), controller.createProposal);
router.post('/proposals/:id/confirm', validateRequest({ params: proposalIdSchema, body: proposalConfirmSchema }), controller.confirmProposal);
router.delete('/proposals/:id', validateRequest({ params: proposalIdSchema }), controller.cancelProposal);
export default router;
