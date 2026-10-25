import { z } from 'zod';
import { transactionSchema } from '../expenses/expenses.schemas.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const summaryDateSchema = z.string()
  .regex(datePattern, 'Date must use YYYY-MM-DD.')
  .refine(isCalendarDate, 'Date must be a real calendar date.');

// API accepts natural language; Gemini selects tool and generates structured filters.
export const expenseAgentRequestSchema = z.object({
  message: z.string().trim().min(1, 'Query message is required.').max(1000),
  // UI context is strictly constrained to avoid unvalidated localStorage inputs.
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(1000) }))
    .max(8, 'History may contain at most 8 messages.').optional().default([]),
});

// Boundary between Gemini and database. Never use unparsed model arguments.
export const searchTransactionsArgsSchema = z.object({
  merchant: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['income', 'expense']).optional(),
  from: z.string().regex(datePattern, 'from must use YYYY-MM-DD.').optional(),
  to: z.string().regex(datePattern, 'to must use YYYY-MM-DD.').optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().max(100).optional().default(1),
  pageSize: z.coerce.number().int().positive().max(20).optional().default(10),
}).refine((args) => !args.from || !args.to || args.from <= args.to, {
  message: 'from must not be after to.', path: ['to'],
}).refine((args) => args.minAmount === undefined || args.maxAmount === undefined || args.minAmount <= args.maxAmount, {
  message: 'minAmount must not be greater than maxAmount.', path: ['maxAmount'],
});

// Tool summary only accepts ISO date ranges normalized by Gemini.
export const spendingSummaryArgsSchema = z.object({
  from: summaryDateSchema,
  to: summaryDateSchema,
}).refine((args) => args.from <= args.to, {
  message: 'from must not be after to.', path: ['to'],
});

// Proposal reuses CRUD rules while rejecting non-existent calendar dates
// like 2026-02-30 before reaching Supabase.
export const createTransactionArgsSchema = transactionSchema.superRefine((transaction, context) => {
  if (!isCalendarDate(transaction.date)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Date must be a real calendar date.' });
  }
});
export const proposalIdSchema = z.object({ id: z.string().uuid('Invalid proposal id.') });
export const proposalConfirmSchema = z.object({ transaction: createTransactionArgsSchema });
