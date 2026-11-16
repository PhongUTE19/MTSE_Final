import * as chatHistoryService from './chatHistory.service.js';
import { HTTP_STATUS } from '../../constants/index.js';

async function respond(action, req, res, next) {
  try {
    await action();
  } catch (error) {
    next(error);
  }
}

export const listConversations = (req, res, next) =>
  respond(
    async () => {
      const conversations = await chatHistoryService.listConversations(req.user);
      res.json({ conversations });
    },
    req,
    res,
    next
  );

export const getConversation = (req, res, next) =>
  respond(
    async () => {
      const result = await chatHistoryService.getConversationWithMessages(req.user, req.params.id);
      res.json(result);
    },
    req,
    res,
    next
  );

export const createConversation = (req, res, next) =>
  respond(
    async () => {
      const conversation = await chatHistoryService.createConversation(req.user, res.locals.validated.body);
      res.status(HTTP_STATUS.CREATED).json({ conversation });
    },
    req,
    res,
    next
  );

export const updateConversation = (req, res, next) =>
  respond(
    async () => {
      const conversation = await chatHistoryService.updateConversation(
        req.user,
        req.params.id,
        res.locals.validated.body
      );
      res.json({ conversation });
    },
    req,
    res,
    next
  );

export const deleteConversation = (req, res, next) =>
  respond(
    async () => {
      const result = await chatHistoryService.deleteConversation(req.user, req.params.id);
      res.json(result);
    },
    req,
    res,
    next
  );

export const appendMessage = (req, res, next) =>
  respond(
    async () => {
      const message = await chatHistoryService.appendMessage(
        req.user,
        req.params.id,
        res.locals.validated.body
      );
      res.status(HTTP_STATUS.CREATED).json({ message });
    },
    req,
    res,
    next
  );
