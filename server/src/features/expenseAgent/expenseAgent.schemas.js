import { z } from 'zod';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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
