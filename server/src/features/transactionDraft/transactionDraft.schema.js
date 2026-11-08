import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoCalendarDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === m - 1 &&
    utc.getUTCDate() === d
  );
}

export const isoCalendarDateSchema = z
  .string()
  .regex(datePattern, 'Date must use YYYY-MM-DD.')
  .refine(isValidIsoCalendarDate, 'Date must be a valid calendar date.');

export const draftTransactionFieldsSchema = z.object({
  type: z.enum(['income', 'expense']).default('expense'),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  date: isoCalendarDateSchema,
  category: z.string().trim().min(1, 'Category is required.').max(60),
  merchant: z.string().trim().min(1, 'Merchant or description is required.').max(120),
  note: z.string().trim().max(500).optional().default(''),
  items: z.array(z.object({
    name: z.string().trim().min(1),
    amount: z.coerce.number().nonnegative().optional().nullable(),
  })).optional().default([]),
});

export const transactionDraftQuerySchema = z.object({
  status: z.enum(['pending_review', 'confirmed', 'rejected']).optional().default('pending_review'),
});

export const transactionDraftIdParamSchema = z.object({
  id: z.string().uuid('Invalid draft ID format.'),
});

export const transactionDraftConfirmSchema = z.object({
  type: z.enum(['income', 'expense']).optional(),
  amount: z.coerce.number().positive().optional(),
  date: isoCalendarDateSchema.optional(),
  category: z.string().trim().min(1).max(60).optional(),
  merchant: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    name: z.string().trim().min(1),
    amount: z.coerce.number().nonnegative().optional().nullable(),
  })).optional(),
}).optional().default({});

export const transactionDraftPatchSchema = z.union([
  z.object({
    reviewedData: draftTransactionFieldsSchema.partial(),
  }),
  draftTransactionFieldsSchema.partial(),
]);
