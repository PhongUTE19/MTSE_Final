import express from 'express';
import * as controller from './expenses.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { receiptOcrRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { transactionQuerySchema, transactionSchema } from './expenses.schemas.js';
import { receiptConfirmSchema } from './receipt.schemas.js';
import { uploadReceiptImage } from './receiptUpload.middleware.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
const router = express.Router();

// Routes map HTTP method and path to corresponding controller handlers.
router.use(authenticate);
router.get('/transactions', validateRequest({ query: transactionQuerySchema }), controller.list);
router.get('/transactions/:id', controller.get);
router.post('/transactions', validateRequest({ body: transactionSchema }), controller.create);
router.put('/transactions/:id', validateRequest({ body: transactionSchema }), controller.update);
router.delete('/transactions/:id', controller.remove);
router.post('/receipts/upload', receiptOcrRateLimiter, uploadReceiptImage, controller.upload);
router.get('/receipts', controller.listReceipts);
router.get('/receipts/:id/preview', controller.previewReceipt);
router.post('/receipts/:id/retry', receiptOcrRateLimiter, controller.retryReceipt);
router.post('/receipts/:id/confirm', validateRequest({ body: receiptConfirmSchema }), controller.confirmReceipt);
router.delete('/receipts/:id', controller.deleteReceipt);
export default router;
