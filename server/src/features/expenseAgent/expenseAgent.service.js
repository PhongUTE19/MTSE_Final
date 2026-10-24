import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { listTransactions } from '../expenses/expenses.service.js';
import { searchTransactionsArgsSchema } from './expenseAgent.schemas.js';
import { runGeminiExpenseAgent } from './geminiExpenseAgent.js';

const MAX_AGENT_STEPS = 2; // Gemini gọi tool một lần, sau đó chỉ tổng hợp câu trả lời.

export async function searchTransactionsForUser(user, message, options = {}) {
  let executedSteps = 0;
  const executeTool = async (toolName, rawArgs) => {
    executedSteps += 1;
    if (executedSteps >= MAX_AGENT_STEPS) throw new AppError('Agent step limit reached.', HTTP_STATUS.BAD_REQUEST);
    if (toolName !== 'search_transactions') throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);

    const parsed = searchTransactionsArgsSchema.safeParse(rawArgs);
    if (!parsed.success) throw new AppError('Gemini returned invalid search filters.', HTTP_STATUS.BAD_REQUEST);
    const args = parsed.data;

    // Tái sử dụng Expense Service để giữ cùng RLS-aware client và owner predicate.
    const result = await (options.listTransactions || listTransactions)(user, {
      search: args.merchant || '', category: args.category, type: args.type,
      from: args.from, to: args.to, minAmount: args.minAmount, maxAmount: args.maxAmount,
      page: args.page, pageSize: args.pageSize, sortBy: 'date', sortOrder: 'desc',
    });
    return { ...result, appliedFilters: args };
  };

  try {
    return await (options.agentRunner || runGeminiExpenseAgent)(message, executeTool, options);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Không log prompt, token, tham số hay raw provider error vì có thể chứa dữ liệu tài chính.
    console.error('[ExpenseAgent] Search failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Expense search is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
