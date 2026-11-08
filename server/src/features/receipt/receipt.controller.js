import * as receiptService from './receipt.service.js';
import { HTTP_STATUS } from '../../constants/index.js';

// Forward business errors to Express shared error handler.
async function respond(action, req, res, next) {
  try {
    await action();
  } catch (error) {
    next(error);
  }
}

export const upload = (req, res, next) =>
  respond(
    async () => {
      const receipt = await receiptService.uploadReceipt(
        req.user,
        req.receiptFile,
        req.receiptMeta
      );
      res.status(HTTP_STATUS.CREATED).json({ receipt });
    },
    req,
    res,
    next
  );

export const listReceipts = (req, res, next) =>
  respond(
    async () => {
      const receipts = await receiptService.listReceipts(req.user);
      res.json({ receipts });
    },
    req,
    res,
    next
  );

export const retryReceipt = (req, res, next) =>
  respond(
    async () => {
      const receipt = await receiptService.retryReceipt(req.user, req.params.id);
      res.json({ receipt });
    },
    req,
    res,
    next
  );

export const previewReceipt = (req, res, next) =>
  respond(
    async () => {
      const result = await receiptService.previewReceipt(req.user, req.params.id);
      res.json(result);
    },
    req,
    res,
    next
  );
