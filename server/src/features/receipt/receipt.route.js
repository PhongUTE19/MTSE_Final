import express from 'express';
import * as controller from './receipt.controller.js';
import { receiptOcrRateLimiter } from '../../shared/middleware/rateLimiter.js';
import { uploadReceiptImage } from './receiptUpload.middleware.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';

const router = express.Router();

router.use(authenticate, authorize('user'));
router.post('/upload', receiptOcrRateLimiter, uploadReceiptImage, controller.upload);
router.post('/confirm', uploadReceiptImage, controller.confirmReceipt);
router.get('/', controller.listReceipts);
router.get('/:id/preview', controller.previewReceipt);
router.post('/:id/retry', receiptOcrRateLimiter, controller.retryReceipt);

export default router;
