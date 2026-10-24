import { getSpendingSummaryForUser, searchTransactionsForUser } from './expenseAgent.service.js';

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
