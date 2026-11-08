import express from 'express';
import * as controller from './transactionDraft.controller.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import {
  transactionDraftQuerySchema,
  transactionDraftIdParamSchema,
  transactionDraftConfirmSchema,
  transactionDraftPatchSchema,
} from './transactionDraft.schema.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  validateRequest({ query: transactionDraftQuerySchema }),
  controller.list
);

router.get(
  '/:id',
  validateRequest({ params: transactionDraftIdParamSchema }),
  controller.get
);

router.patch(
  '/:id',
  validateRequest({ params: transactionDraftIdParamSchema, body: transactionDraftPatchSchema }),
  controller.patch
);

router.post(
  '/:id/confirm',
  validateRequest({ params: transactionDraftIdParamSchema, body: transactionDraftConfirmSchema }),
  controller.confirm
);

router.post(
  '/:id/reject',
  validateRequest({ params: transactionDraftIdParamSchema }),
  controller.reject
);

export default router;
