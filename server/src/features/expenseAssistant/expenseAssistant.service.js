import crypto from 'crypto';
import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS, SERVER_MESSAGES } from '../../constants/index.js';
import { detectPromptInjection } from '../../shared/guardrails/index.js';
import { getSpendingSummary, listTransactions } from '../transaction/transaction.service.js';
import { createTransactionArgsSchema, searchTransactionsArgsSchema, spendingSummaryArgsSchema } from './expenseAssistant.schema.js';
import { runGeminiExpenseAssistant } from './geminiExpenseAssistant.js';
import { formatConversationContext } from './expenseAssistantPrompt.js';
import { registerLegacyAgentRunner } from '../chatAssistant/chatAssistant.service.js';
import { orchestrateUnifiedChat } from '../chatAssistant/assistantOrchestrator.js';

const MAX_AGENT_STEPS = 2; // Gemini calls tool once, then summarizes response.

function assertAuthenticatedUser(user) {
  if (!user?.id || !user?.token) {
    throw new AppError(
      SERVER_MESSAGES.AUTH?.AUTH_REQUIRED || 'Authentication required.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }
}

export async function searchTransactionsForUser(user, message, options = {}) {
  assertAuthenticatedUser(user);
  const injection = detectPromptInjection(message);
  if (injection.isInjection) {
    return { answer: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL, toolName: null, toolResult: null };
  }
  let executedSteps = 0;
  const executeTool = async (toolName, rawArgs) => {
    executedSteps += 1;
    if (executedSteps >= MAX_AGENT_STEPS) throw new AppError('Agent step limit reached.', HTTP_STATUS.BAD_REQUEST);
    if (toolName !== 'search_transactions') throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);

    const parsed = searchTransactionsArgsSchema.safeParse(rawArgs);
    if (!parsed.success) throw new AppError('Gemini returned invalid search filters.', HTTP_STATUS.BAD_REQUEST);
    const args = parsed.data;

    // Reuse Expense Service to maintain same RLS-aware client and owner predicate.
    const result = await (options.listTransactions || listTransactions)(user, {
      search: args.merchant || '', category: args.category, type: args.type,
      from: args.from, to: args.to, minAmount: args.minAmount, maxAmount: args.maxAmount,
      page: args.page, pageSize: args.pageSize, sortBy: 'date', sortOrder: 'desc',
    });
    return { ...result, appliedFilters: args };
  };

  try {
    return await (options.agentRunner || runGeminiExpenseAssistant)(message, executeTool, options);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Do not log prompts, tokens, parameters or raw provider errors to protect financial data.
    console.error('[ExpenseAgent] Search failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Expense search is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function getSpendingSummaryForUser(user, message, options = {}) {
  assertAuthenticatedUser(user);
  const injection = detectPromptInjection(message);
  if (injection.isInjection) {
    return { answer: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL, toolName: null, toolResult: null };
  }
  let executedSteps = 0;
  const executeTool = async (toolName, rawArgs) => {
    executedSteps += 1;
    if (executedSteps >= MAX_AGENT_STEPS) throw new AppError('Agent step limit reached.', HTTP_STATUS.BAD_REQUEST);
    if (toolName !== 'get_spending_summary') throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);

    const parsed = spendingSummaryArgsSchema.safeParse(rawArgs);
    if (!parsed.success) throw new AppError('Gemini returned invalid summary period.', HTTP_STATUS.BAD_REQUEST);

    // User identity always comes from authenticated JWT, never from Gemini args.
    return (options.getSpendingSummary || getSpendingSummary)(user, parsed.data);
  };

  try {
    return await (options.agentRunner || runGeminiExpenseAssistant)(message, executeTool, {
      ...options, agentType: 'summary',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Summary failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Expense summary is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

async function createDraftFromArgs(_user, rawArgs, options = {}) {
  const parsed = createTransactionArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new AppError('Gemini returned incomplete or invalid transaction details.', HTTP_STATUS.BAD_REQUEST);
  }

  const draftId = crypto.randomUUID();
  const sourceRef = options.conversationId || options.sourceRef || null;

  return {
    draftId,
    sourceType: 'assistant_proposal',
    sourceRef,
    draft: parsed.data,
  };
}

export async function createTransactionProposalForUser(user, message, options = {}) {
  assertAuthenticatedUser(user);
  const injection = detectPromptInjection(message);
  if (injection.isInjection) {
    return { answer: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL, toolName: null, toolResult: null };
  }
  const executeTool = async (toolName, rawArgs) => {
    if (toolName !== 'create_transaction') throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);
    return createDraftFromArgs(user, rawArgs, options);
  };
  try {
    return await (options.agentRunner || runGeminiExpenseAssistant)(message, executeTool, { ...options, agentType: 'create' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Proposal failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Transaction proposal is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/** Single chat endpoint where Gemini selects 1 of 3 declared tools. */
export async function runExpenseAssistantForUser(user, message, options = {}) {
  assertAuthenticatedUser(user);
  const injection = detectPromptInjection(message);
  if (injection.isInjection) {
    return { answer: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL, toolName: null, toolResult: null };
  }
  if (Array.isArray(options.history)) {
    for (const turn of options.history) {
      if (detectPromptInjection(turn.text).isInjection) {
        return { answer: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL, toolName: null, toolResult: null };
      }
    }
  }
  let executedSteps = 0;
  const executeTool = async (toolName, rawArgs) => {
    executedSteps += 1;
    if (executedSteps >= MAX_AGENT_STEPS) throw new AppError('Agent step limit reached.', HTTP_STATUS.BAD_REQUEST);

    if (toolName === 'search_transactions') {
      const parsed = searchTransactionsArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw new AppError('Gemini returned invalid search filters.', HTTP_STATUS.BAD_REQUEST);
      const args = parsed.data;
      const result = await (options.listTransactions || listTransactions)(user, {
        search: args.merchant || '', category: args.category, type: args.type, from: args.from, to: args.to,
        minAmount: args.minAmount, maxAmount: args.maxAmount, page: args.page, pageSize: args.pageSize,
        sortBy: 'date', sortOrder: 'desc',
      });
      return { ...result, appliedFilters: args };
    }
    if (toolName === 'get_spending_summary') {
      const parsed = spendingSummaryArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw new AppError('Gemini returned invalid summary period.', HTTP_STATUS.BAD_REQUEST);
      return (options.getSpendingSummary || getSpendingSummary)(user, parsed.data);
    }
    if (toolName === 'create_transaction') return createDraftFromArgs(user, rawArgs, options);
    throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);
  };

  try {
    const context = (options.history || []).map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.text}`).join('\n');
    // Only send validated conversation turns; identity and authorization always derive from JWT.
    const prompt = formatConversationContext(context, message);
    return await (options.agentRunner || runGeminiExpenseAssistant)(prompt, executeTool, { ...options, agentType: 'assistant' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Assistant failed', { name: error?.name || 'UnknownError' });
    throw new AppError('AI expense assistant is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

registerLegacyAgentRunner(runExpenseAssistantForUser);

/**
 * Legacy compatibility facade delegating /api/expense-assistant to the unified
 * orchestrator and normalizing `propose_transaction` -> `create_transaction`.
 */
export async function runUnifiedExpenseAssistant(user, message, options = {}) {
  const resolvedConversationId = options.conversationId || null;
  const result = await orchestrateUnifiedChat(user, message, {
    ...options,
    conversationId: resolvedConversationId,
  });

  const isProposal = result.toolName === 'propose_transaction' && result.proposal;
  const legacyToolName = isProposal ? 'create_transaction' : (result.toolName || null);
  const legacyToolResult = isProposal
    ? {
        sourceType: 'assistant_proposal',
        sourceRef: result.toolResult?.sourceRef ?? resolvedConversationId,
        draft: result.proposal,
      }
    : (result.toolResult || null);

  return {
    answer: result.answer,
    strategy: result.strategy || 'unified',
    toolName: legacyToolName,
    toolResult: legacyToolResult,
    sources: result.sources || [],
    retrieval: result.retrieval || null,
  };
}
