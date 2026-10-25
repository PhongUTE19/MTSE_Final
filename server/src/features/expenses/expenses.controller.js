import * as expenseService from './expenses.service.js';
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

export const list = (req, res, next) => respond(
  async () => res.json(await expenseService.listTransactions(req.user, res.locals.validated.query)), req, res, next
);

export const get = (req, res, next) => respond(
  async () => res.json({ transaction: await expenseService.getTransaction(req.user, req.params.id) }), req, res, next
);

export const create = (req, res, next) => respond(
  async () => res.status(HTTP_STATUS.CREATED).json({ transaction: await expenseService.createTransaction(req.user, res.locals.validated.body) }), req, res, next
);

export const update = (req, res, next) => respond(
  async () => res.json({ transaction: await expenseService.updateTransaction(req.user, req.params.id, res.locals.validated.body) }), req, res, next
);

export const remove = (req, res, next) => respond(
  async () => {
    const linkedDeletion = await receiptService.deleteConfirmedReceiptTransaction(req.user, req.params.id);
    res.json({ transaction: linkedDeletion?.transaction || await expenseService.deleteTransaction(req.user, req.params.id) });
  }, req, res, next
);

export const upload = (req, res, next) => respond(
  async () => res.status(HTTP_STATUS.CREATED).json({ receipt: await receiptService.uploadReceipt(req.user, req.receiptFile, req.receiptMeta) }), req, res, next
);

export const listReceipts = (req, res, next) => respond(async () => res.json({ receipts: await receiptService.listReceipts(req.user) }), req, res, next);
export const retryReceipt = (req, res, next) => respond(async () => res.json({ receipt: await receiptService.retryReceipt(req.user, req.params.id) }), req, res, next);
export const confirmReceipt = (req, res, next) => respond(async () => res.json(await receiptService.confirmReceipt(req.user, req.params.id, res.locals.validated.body.finalTransaction)), req, res, next);
export const deleteReceipt = (req, res, next) => respond(async () => res.json({ receipt: await receiptService.deleteReceipt(req.user, req.params.id) }), req, res, next);
export const previewReceipt = (req, res, next) => respond(async () => res.json(await receiptService.previewReceipt(req.user, req.params.id)), req, res, next);
