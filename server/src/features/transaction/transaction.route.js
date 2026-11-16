import express from 'express';
import * as controller from './transaction.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { transactionQuerySchema, transactionSchema } from './transaction.schema.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';

const router = express.Router();

// Scope auth middleware to /transaction so mounting at /api never intercepts sibling routes like /api/health.
router.use('/transaction', authenticate, authorize('user'));
router.get('/transaction', validateRequest({ query: transactionQuerySchema }), controller.list);
router.get('/transaction/:id', controller.get);
router.post('/transaction', validateRequest({ body: transactionSchema }), controller.create);
router.put('/transaction/:id', validateRequest({ body: transactionSchema }), controller.update);
router.delete('/transaction/:id', controller.remove);

export default router;
