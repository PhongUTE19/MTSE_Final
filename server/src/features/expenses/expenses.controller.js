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

export const list = (req, res, next) =>
  respond(
    async () => {
      const data = await expenseService.listTransactions(req.user, res.locals.validated.query);
      res.json(data);
    },
    req,
    res,
    next
  );

export const get = (req, res, next) =>
  respond(
    async () => {
      const transaction = await expenseService.getTransaction(req.user, req.params.id);
      res.json({ transaction });
    },
    req,
    res,
    next
  );

export const create = (req, res, next) =>
  respond(
    async () => {
      const transaction = await expenseService.createTransaction(
        req.user,
        res.locals.validated.body
      );
      res.status(HTTP_STATUS.CREATED).json({ transaction });
    },
    req,
    res,
    next
  );

export const update = (req, res, next) =>
  respond(
    async () => {
      const transaction = await expenseService.updateTransaction(
        req.user,
        req.params.id,
        res.locals.validated.body
      );
      res.json({ transaction });
    },
    req,
    res,
    next
  );

export const remove = (req, res, next) =>
  respond(
    async () => {
      const linkedDeletion = await receiptService.deleteConfirmedReceiptTransaction(
        req.user,
        req.params.id
      );
      const transaction =
        linkedDeletion?.transaction ||
        (await expenseService.deleteTransaction(req.user, req.params.id));
      res.json({ transaction });
    },
    req,
    res,
    next
  );

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

export const confirmReceipt = (req, res, next) =>
  respond(
    async () => {
      const result = await receiptService.confirmReceipt(
        req.user,
        req.params.id,
        res.locals.validated.body.finalTransaction
      );
      res.json(result);
    },
    req,
    res,
    next
  );

export const deleteReceipt = (req, res, next) =>
  respond(
    async () => {
      const receipt = await receiptService.deleteReceipt(req.user, req.params.id);
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
