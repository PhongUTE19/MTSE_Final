import {
  createTransactionProposalForUser,
  getSpendingSummaryForUser,
  runUnifiedExpenseAssistant,
  searchTransactionsForUser,
} from './expenseAssistant.service.js';
import { getGeminiExpenseAssistantClientForTests } from './geminiExpenseAssistant.js';

export async function search(req, res, next) {
  try {
    const result = await searchTransactionsForUser(req.user, res.locals.validated.body.message);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function summary(req, res, next) {
  try {
    const result = await getSpendingSummaryForUser(req.user, res.locals.validated.body.message);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function assistant(req, res, next) {
  try {
    const { message, history, conversationId } = res.locals.validated.body;
    const resolvedConversationId = conversationId || req.body?.conversationId || null;
    const result = await runUnifiedExpenseAssistant(req.user, message, {
      history,
      conversationId: resolvedConversationId,
      ai: getGeminiExpenseAssistantClientForTests(),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createProposal(req, res, next) {
  try {
    const { message, conversationId } = res.locals.validated.body;
    const result = await createTransactionProposalForUser(
      req.user,
      message,
      { conversationId: conversationId || req.body?.conversationId || null }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}
