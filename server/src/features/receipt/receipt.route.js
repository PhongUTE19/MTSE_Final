import express from 'express';
import * as controller from './receipt.controller.js';
import { receiptOcrRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { uploadReceiptImage } from './receiptUpload.middleware.js';
import { authenticate } from '../../shared/middleware/authenticate.js';

const router = express.Router();

router.use(authenticate);
router.post('/upload', receiptOcrRateLimiter, uploadReceiptImage, controller.upload);
router.get('/', controller.listReceipts);
router.get('/:id/preview', controller.previewReceipt);
router.post('/:id/retry', receiptOcrRateLimiter, controller.retryReceipt);

export default router;
