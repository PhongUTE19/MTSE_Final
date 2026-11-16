import express from 'express';
import * as controller from './chatHistory.controller.js';
import { authenticate, authorize, validateRequest } from '../../shared/middleware/index.js';
import {
  conversationIdParamSchema,
  createConversationSchema,
  updateConversationSchema,
  appendMessageSchema,
} from './chatHistory.schema.js';

const router = express.Router();

router.use(authenticate, authorize('user'));

router.get('/', controller.listConversations);
router.post('/', validateRequest({ body: createConversationSchema }), controller.createConversation);
router.get('/:id', validateRequest({ params: conversationIdParamSchema }), controller.getConversation);
router.patch(
  '/:id',
  validateRequest({ params: conversationIdParamSchema, body: updateConversationSchema }),
  controller.updateConversation
);
router.delete('/:id', validateRequest({ params: conversationIdParamSchema }), controller.deleteConversation);
router.post(
  '/:id/messages',
  validateRequest({ params: conversationIdParamSchema, body: appendMessageSchema }),
  controller.appendMessage
);

export default router;
