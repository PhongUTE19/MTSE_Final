import express from 'express';
import * as controller from './transaction.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { transactionQuerySchema, transactionSchema } from './transaction.schema.js';
import { authenticate } from '../../shared/middleware/authenticate.js';

const router = express.Router();

// Routes map HTTP method and path to corresponding controller handlers.
router.use(authenticate);
router.get('/transaction', validateRequest({ query: transactionQuerySchema }), controller.list);
router.get('/transaction/:id', controller.get);
router.post('/transaction', validateRequest({ body: transactionSchema }), controller.create);
router.put('/transaction/:id', validateRequest({ body: transactionSchema }), controller.update);
router.delete('/transaction/:id', controller.remove);

export default router;
