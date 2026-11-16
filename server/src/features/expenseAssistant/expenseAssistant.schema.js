import { z } from 'zod';
export {
  createTransactionArgsSchema,
  searchTransactionsArgsSchema,
  spendingSummaryArgsSchema,
} from '../transaction/transaction.schema.js';

// API accepts natural language; Gemini selects tool and generates structured filters.
export const expenseAssistantRequestSchema = z.object({
  message: z.string().trim().min(1, 'Query message is required.').max(1000),
  // UI context is strictly constrained to avoid unvalidated localStorage inputs.
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(1000) }))
    .max(8, 'History may contain at most 8 messages.').optional().default([]),
  conversationId: z.string().max(100).optional(),
});
