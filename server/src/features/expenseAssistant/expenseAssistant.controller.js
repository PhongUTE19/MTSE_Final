import {
  createTransactionProposalForUser,
  getSpendingSummaryForUser,
  runExpenseAssistantForUser,
  searchTransactionsForUser,
} from './expenseAssistant.service.js';

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
    const rawResult = await runExpenseAssistantForUser(req.user, message, {
      history,
      conversationId: conversationId || req.body?.conversationId || null,
    });
    res.json({
      answer: rawResult.answer,
      strategy: 'agent',
      toolName: rawResult.toolName || null,
      toolResult: rawResult.toolResult || null,
      sources: [],
      retrieval: null,
    });
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
