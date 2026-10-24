import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const summaryDateSchema = z.string()
  .regex(datePattern, 'Date must use YYYY-MM-DD.')
  .refine(isCalendarDate, 'Date must be a real calendar date.');

// API chỉ nhận câu hỏi tự nhiên; Gemini sẽ tự chọn tool và tạo bộ lọc có cấu trúc.
export const expenseAgentRequestSchema = z.object({
  message: z.string().trim().min(1, 'Query message is required.').max(1000),
});

// Đây là ranh giới an toàn giữa Gemini và database. Không dùng args từ model khi chưa parse.
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

// Tool summary chỉ nhận khoảng ngày đã được Gemini chuẩn hoá thành ISO date.
export const spendingSummaryArgsSchema = z.object({
  from: summaryDateSchema,
  to: summaryDateSchema,
}).refine((args) => args.from <= args.to, {
  message: 'from must not be after to.', path: ['to'],
});
