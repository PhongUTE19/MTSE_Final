import {
  cancelTransactionProposal,
  confirmTransactionProposal,
  createTransactionProposalForUser,
  getSpendingSummaryForUser,
  searchTransactionsForUser,
} from './expenseAgent.service.js';
import { orchestrateChat } from '../assistant/assistant.service.js';

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
    const result = await orchestrateChat(message, {
      user: req.user,
      history,
      strategy: 'agent',
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createProposal(req, res, next) {
  try {
    const result = await createTransactionProposalForUser(
      req.user,
      res.locals.validated.body.message
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function confirmProposal(req, res, next) {
  try {
    const transaction = await confirmTransactionProposal(
      req.user,
      req.params.id,
      res.locals.validated.body.transaction
    );
    res.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
}

export async function cancelProposal(req, res, next) {
  try {
    const result = await cancelTransactionProposal(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
