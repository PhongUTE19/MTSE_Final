import * as transactionsService from './transaction.service.js';
import * as receiptService from '../receipt/receipt.service.js';
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
      const data = await transactionsService.listTransactions(req.user, res.locals.validated.query);
      res.json(data);
    },
    req,
    res,
    next
  );

export const get = (req, res, next) =>
  respond(
    async () => {
      const transaction = await transactionsService.getTransaction(req.user, req.params.id);
      res.json({ transaction });
    },
    req,
    res,
    next
  );

export const create = (req, res, next) =>
  respond(
    async () => {
      const transaction = await transactionsService.createTransaction(
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
      const transaction = await transactionsService.updateTransaction(
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
        (await transactionsService.deleteTransaction(req.user, req.params.id));
      res.json({ transaction });
    },
    req,
    res,
    next
  );
