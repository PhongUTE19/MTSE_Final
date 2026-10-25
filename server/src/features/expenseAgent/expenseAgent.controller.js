import { cancelTransactionProposal, confirmTransactionProposal, createTransactionProposalForUser, getSpendingSummaryForUser, runExpenseAssistantForUser, searchTransactionsForUser } from './expenseAgent.service.js';

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
    const { message, history } = res.locals.validated.body;
    res.json(await runExpenseAssistantForUser(req.user, message, { history }));
  } catch (error) {
    next(error);
  }
}

export async function createProposal(req, res, next) { try { res.json(await createTransactionProposalForUser(req.user, res.locals.validated.body.message)); } catch (error) { next(error); } }
export async function confirmProposal(req, res, next) { try { res.status(201).json({ transaction: await confirmTransactionProposal(req.user, req.params.id, res.locals.validated.body.transaction) }); } catch (error) { next(error); } }
export async function cancelProposal(req, res, next) { try { res.json(await cancelTransactionProposal(req.user, req.params.id)); } catch (error) { next(error); } }
