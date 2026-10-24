import { z } from 'zod';
import { EXPENSE_LIMITS, RECEIPT_MIME_TYPES } from './expenses.constants.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Kiểm tra payload giao dịch trước khi chuyển vào business logic.
export const transactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  date: z.string().regex(datePattern, 'Date must use YYYY-MM-DD.'),
  category: z.string().trim().min(1, 'Category is required.').max(60),
  merchant: z.string().trim().min(1, 'Merchant or description is required.').max(120),
  note: z.string().trim().max(500).optional().default(''),
  items: z.array(z.object({ name: z.string().trim().min(1), amount: z.coerce.number().nonnegative() })).optional().default([]),
});

export const transactionQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().optional(),
  from: z.string().regex(datePattern).optional(),
  to: z.string().regex(datePattern).optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(EXPENSE_LIMITS.MAX_PAGE_SIZE).default(10),
  sortBy: z.enum(['date', 'amount']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'From date must not be after to date.',
  path: ['to'],
}).refine((query) => query.minAmount === undefined || query.maxAmount === undefined || query.minAmount <= query.maxAmount, {
  message: 'Minimum amount must not be greater than maximum amount.',
  path: ['maxAmount'],
});

export const receiptSchema = z.object({
  filename: z.string().trim().min(1).max(150),
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  size: z.coerce.number().positive().max(EXPENSE_LIMITS.MAX_RECEIPT_SIZE_BYTES),
});
