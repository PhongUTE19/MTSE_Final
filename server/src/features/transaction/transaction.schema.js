import { z } from 'zod';
import { TRANSACTION_LIMITS } from './transaction.constant.js';
import { zodIntegerParam } from '../../shared/validation/pagination.js';
import { ISO_DATE_PATTERN, isValidIsoCalendarDate } from '../../shared/validation/date.js';
import { parseVndAmount } from '../../shared/validation/money.js';

export { isValidIsoCalendarDate };

const isoCalendarDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'Date must use YYYY-MM-DD.')
  .refine(isValidIsoCalendarDate, 'Date must be a valid calendar date.');

// Validate transaction payload before passing to business logic.
export const transactionSchema = z.object({
  id: z.string().uuid('Transaction ID must be a valid UUID.').optional(),
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  date: isoCalendarDateSchema,
  category: z.string().trim().min(1, 'Category is required.').max(60),
  merchant: z.string().trim().min(1, 'Merchant or description is required.').max(120),
  note: z.string().trim().max(500).optional().default(''),
  items: z.array(z.object({ name: z.string().trim().min(1), amount: z.coerce.number().nonnegative() })).optional().default([]),
});

export const transactionQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().optional(),
  from: isoCalendarDateSchema.optional(),
  to: isoCalendarDateSchema.optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  page: zodIntegerParam({ defaultValue: 1, min: 1 }),
  pageSize: zodIntegerParam({
    defaultValue: 10,
    min: 1,
    max: TRANSACTION_LIMITS.MAX_PAGE_SIZE,
  }),
  sortBy: z.enum(['date', 'amount']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'From date must not be after to date.',
  path: ['to'],
}).refine((query) => query.minAmount === undefined || query.maxAmount === undefined || query.minAmount <= query.maxAmount, {
  message: 'Minimum amount must not be greater than maximum amount.',
  path: ['maxAmount'],
});

export const searchTransactionsArgsSchema = z.object({
  merchant: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['income', 'expense']).optional(),
  from: z.string().regex(ISO_DATE_PATTERN, 'from must use YYYY-MM-DD.').optional(),
  to: z.string().regex(ISO_DATE_PATTERN, 'to must use YYYY-MM-DD.').optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().max(100).optional().default(1),
  pageSize: z.coerce.number().int().positive().max(20).optional().default(10),
}).refine((args) => !args.from || !args.to || args.from <= args.to, {
  message: 'from must not be after to.', path: ['to'],
}).refine((args) => args.minAmount === undefined || args.maxAmount === undefined || args.minAmount <= args.maxAmount, {
  message: 'minAmount must not be greater than maxAmount.', path: ['maxAmount'],
});

export const spendingSummaryArgsSchema = z.object({
  from: isoCalendarDateSchema,
  to: isoCalendarDateSchema,
}).refine((args) => args.from <= args.to, {
  message: 'from must not be after to.', path: ['to'],
});

function normalizeVndProposalAmount(value) {
  const parsed = parseVndAmount(value);
  return parsed === null ? Number.NaN : parsed;
}

export const createTransactionArgsSchema = transactionSchema.extend({
  amount: z.preprocess(
    normalizeVndProposalAmount,
    z.number({ invalid_type_error: 'Amount must be a valid VND number.' }).positive('Amount must be greater than zero.')
  ),
  items: z.array(z.object({
    name: z.string().trim().min(1),
    amount: z.preprocess(
      normalizeVndProposalAmount,
      z.number({ invalid_type_error: 'Item amount must be a valid VND number.' }).nonnegative()
    ),
  })).optional().default([]),
}).superRefine((transaction, context) => {
  if (!isValidIsoCalendarDate(transaction.date)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['date'], message: 'Date must be a real calendar date.' });
  }
});
