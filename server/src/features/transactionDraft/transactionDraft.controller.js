import * as service from './transactionDraft.service.js';
import { HTTP_STATUS } from '../../constants/index.js';

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
      const status = res.locals.validated?.query?.status || req.query.status || 'pending_review';
      const drafts = await service.listDrafts(req.user, status);
      res.json({ drafts });
    },
    req,
    res,
    next
  );

export const get = (req, res, next) =>
  respond(
    async () => {
      const id = req.params.id;
      const draft = await service.getDraft(req.user, id);
      res.json({ draft });
    },
    req,
    res,
    next
  );

export const patch = (req, res, next) =>
  respond(
    async () => {
      const id = req.params.id;
      const payload = res.locals.validated?.body ?? req.body;
      const draft = await service.patchDraft(req.user, id, payload);
      res.json({ draft });
    },
    req,
    res,
    next
  );

export const confirm = (req, res, next) =>
  respond(
    async () => {
      const id = req.params.id;
      const reviewedFields = res.locals.validated?.body ?? req.body;
      const result = await service.confirmDraft(req.user, id, reviewedFields);
      res.json(result);
    },
    req,
    res,
    next
  );

export const reject = (req, res, next) =>
  respond(
    async () => {
      const id = req.params.id;
      const result = await service.rejectDraft(req.user, id);
      res.json(result);
    },
    req,
    res,
    next
  );
