import { config } from '../../config.js';
import { RETRY_CONFIG } from '../../constants/index.js';
import { recordUsage, hashPrompt } from '../analytics/index.js';
import { getAIClient, executeWithRetry } from '../../shared/integrations/ai/providers/geminiProvider.js';

export const SEARCH_TRANSACTIONS_TOOL = Object.freeze({
  name: 'search_transactions',
  description: 'Search only the authenticated user\'s expense and income transactions. Use ISO YYYY-MM-DD dates and VND numeric amounts.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      merchant: { type: 'string', description: 'Merchant or store name.' },
      category: { type: 'string', description: 'Transaction category.' },
      type: { type: 'string', enum: ['income', 'expense'] },
      from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
      to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
      minAmount: { type: 'number', description: 'Inclusive minimum amount.' },
      maxAmount: { type: 'number', description: 'Inclusive maximum amount.' },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 20 },
    },
  },
});

export const SPENDING_SUMMARY_TOOL = Object.freeze({
  name: 'get_spending_summary',
  description: 'Calculate income, expenses, balance, and expense categories for the authenticated user over an inclusive ISO date range.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Inclusive start date, YYYY-MM-DD.' },
      to: { type: 'string', description: 'Inclusive end date, YYYY-MM-DD.' },
    },
    required: ['from', 'to'],
  },
});

export const CREATE_TRANSACTION_TOOL = Object.freeze({
  name: 'create_transaction',
  description: 'Create a review-only transaction proposal for the authenticated user. This does not save data; the user must confirm separately.',
  parametersJsonSchema: {
    type: 'object', properties: {
      type: { type: 'string', enum: ['income', 'expense'] }, amount: { type: 'number', minimum: 0.01 },
      date: { type: 'string', description: 'Transaction date, YYYY-MM-DD.' }, category: { type: 'string' },
      merchant: { type: 'string' }, note: { type: 'string' },
    }, required: ['type', 'amount', 'date', 'category', 'merchant'],
  },
});

let clientFactory = null;
export function setGeminiExpenseAgentClientFactoryForTests(factory) { clientFactory = factory; }

// Supabase transaction_date is local calendar date. Use Vietnam time zone
// instead of server UTC so "yesterday / this month" dates do not shift at midnight.
export function getVietnamDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getClient() {
  if (clientFactory) return clientFactory();
  return getAIClient();
}

function safeRecordUsage(recordData) {
  try {
    recordUsage(recordData);
  } catch (error) {
    // Non-fatal: Tracking failures must never disrupt user requests or financial flows
    console.error('[ExpenseAgent] Failed to record usage (non-fatal):', error.message);
  }
}

function systemInstruction(today) {
  return `You are the transaction-search assistant. Today is ${today}. You must use search_transactions to answer every transaction lookup. Convert an unambiguous month/year to its first and last ISO date. Resolve common relative dates using Today: "hôm qua" is the previous calendar day, "tuần trước" is the previous Monday through Sunday, and "tháng này" is the first through last day of the current month. Ask one short clarification only when there is no reliable date range, such as "gần đây" or "một thời gian trước". Never invent transactions or amounts. After receiving tool results, give a concise Vietnamese answer.`;
}

function summarySystemInstruction(today) {
  return `You are the spending-summary assistant. Today is ${today} in Asia/Ho_Chi_Minh. You must use get_spending_summary for every summary request. Dates are inclusive. Convert a named month to its first and last ISO date. Resolve "tháng này" to the current calendar month and "tuần này" to Monday through Sunday of the current week. If the user does not provide a reliable period, ask one short clarification. Never invent totals, categories, or amounts. After receiving the tool result, explain only those results concisely in Vietnamese.`;
}

function createSystemInstruction(today) {
  return `You create transaction proposals only. Today is ${today} in Asia/Ho_Chi_Minh. Use create_transaction when and only when the user clearly supplied an income or expense type, a positive amount, a real date (use today only if they say hôm nay), category, and merchant or description. Convert common Vietnamese money notation such as "500k" or "500.000đ" to the numeric VND amount 500000. If type is unclear, including "thêm vào 500k", ask one short Vietnamese clarification; do not choose income or expense. A wallet top-up, money transfer, or internal transfer is not income or expense: ask whether it should be recorded as income, expense, or not recorded. Never guess missing important information. The tool only creates a proposal, never a saved transaction. After the tool result, tell the user to review, edit if needed, and confirm.`;
}

function assistantSystemInstruction(today) {
  return `You are an AI expense assistant. Today is ${today} in Asia/Ho_Chi_Minh. Choose exactly one tool when the request is sufficiently clear: search_transactions for transaction history, get_spending_summary for totals by period, and create_transaction to prepare a transaction proposal. For relative dates, resolve “hôm nay”, “hôm qua”, “tháng này”, and “tuần này” correctly. For create_transaction, require a clear income or expense type, positive amount, real date, category, and merchant/description. Normalize "500k" and "500.000đ" to 500000 VND. If type is ambiguous, including "thêm vào 500k", ask one short Vietnamese clarification; do not call create_transaction. A wallet top-up or internal money transfer is not automatically income: ask whether to record it as income, expense, or not record it. Never invent money, transactions, or a period. create_transaction creates a proposal only; clearly tell the user to review and confirm it. After receiving a tool result, answer only from that result in concise Vietnamese.`;
}

/** Runs exactly one read-only function call, then returns Gemini's natural-language summary. */
export async function runGeminiExpenseAgent(message, executeTool, options = {}) {
  const ai = options.ai || getClient();
  const model = options.model || config.geminiModel;
  const timeoutMs = options.timeoutMs ?? 15000;
  const today = options.today || getVietnamDate();
  const instruction = options.agentType === 'summary'
    ? summarySystemInstruction(today)
    : options.agentType === 'create'
      ? createSystemInstruction(today)
      : options.agentType === 'assistant'
        ? assistantSystemInstruction(today)
        : systemInstruction(today);
  const declarations = options.agentType === 'summary'
    ? [SPENDING_SUMMARY_TOOL]
    : options.agentType === 'create'
      ? [CREATE_TRANSACTION_TOOL]
      : options.agentType === 'assistant'
        ? [SEARCH_TRANSACTIONS_TOOL, SPENDING_SUMMARY_TOOL, CREATE_TRANSACTION_TOOL]
        : [SEARCH_TRANSACTIONS_TOOL];
  const generationConfig = {
    systemInstruction: instruction,
    tools: [{ functionDeclarations: declarations }],
    // AUTO allows Gemini to ask for clarification on ambiguous dates instead of guessing filters.
    // Gemini API only allows allowedFunctionNames in ANY mode. AUTO preserves the ability
    // to ask follow-up questions for ambiguous dates; tool declaration already has only target tools.
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  };

  const feature = options.feature || 'expense_agent';
  const promptVersion = hashPrompt(instruction);
  const maxRetries = options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;
  const initialDelayMs = options.initialDelayMs ?? RETRY_CONFIG.INITIAL_DELAY_MS;

  let firstResponse;
  let firstAttempts;
  let firstTotalAttempts;
  let firstDurationMs;

  try {
    const executed = await executeWithRetry(
      () => ai.models.generateContent({
        model,
        contents: message,
        config: generationConfig,
      }),
      maxRetries,
      initialDelayMs,
      timeoutMs,
      'Expense search timed out.'
    );
    firstResponse = executed.result;
    firstAttempts = executed.attempts;
    firstTotalAttempts = executed.totalAttempts;
    firstDurationMs = executed.durationMs;

    const firstCandidate = firstResponse?.candidates?.[0];
    const finishReason = firstCandidate?.finishReason;
    const isRefusal = finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST';
    const usage = firstResponse?.usageMetadata || {};

    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:tool_selection` : 'expenseAgent.toolSelection',
      provider: 'google-genai',
      model,
      outcome: isRefusal ? 'refusal' : 'success',
      isRefusal,
      refusalReason: isRefusal ? finishReason : null,
      durationMs: firstDurationMs,
      attempts: firstAttempts,
      totalAttempts: firstTotalAttempts,
      promptVersion,
      toolsExecuted: [],
      tokenUsage: {
        inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : null,
        outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
        totalTokens: typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : null,
        tokenCountsAvailable: typeof usage.promptTokenCount === 'number',
      },
    });
  } catch (error) {
    const meta = error.executionMetadata || {
      attempts: [{ attemptNumber: 1, durationMs: 0, status: 'failure', error: error.message }],
      totalAttempts: 1,
      durationMs: 0,
    };
    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:tool_selection` : 'expenseAgent.toolSelection',
      provider: 'google-genai',
      model,
      outcome: 'failure',
      durationMs: meta.durationMs,
      attempts: meta.attempts,
      totalAttempts: meta.totalAttempts,
      promptVersion,
      toolsExecuted: [],
      error,
      tokenUsage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });
    throw error;
  }

  const call = firstResponse.functionCalls?.[0];
  if (!call) {
    const clarification = firstResponse.text?.trim();
    if (!clarification) throw new Error('Gemini returned neither a function call nor a clarification.');
    return { answer: clarification, toolName: null, toolResult: null };
  }

  const toolResult = await executeTool(call.name, call.args || {});

  let finalResponse;
  let finalAttempts;
  let finalTotalAttempts;
  let finalDurationMs;

  try {
    const executed = await executeWithRetry(
      () => ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: message }] },
          firstResponse.candidates?.[0]?.content,
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: toolResult } }] },
        ],
        config: { systemInstruction: instruction },
      }),
      maxRetries,
      initialDelayMs,
      timeoutMs,
      'Expense search timed out.'
    );
    finalResponse = executed.result;
    finalAttempts = executed.attempts;
    finalTotalAttempts = executed.totalAttempts;
    finalDurationMs = executed.durationMs;

    const finalCandidate = finalResponse?.candidates?.[0];
    const finishReason = finalCandidate?.finishReason;
    const isRefusal = finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST';
    const usage = finalResponse?.usageMetadata || {};

    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:summary` : 'expenseAgent.summary',
      provider: 'google-genai',
      model,
      outcome: isRefusal ? 'refusal' : 'success',
      isRefusal,
      refusalReason: isRefusal ? finishReason : null,
      durationMs: finalDurationMs,
      attempts: finalAttempts,
      totalAttempts: finalTotalAttempts,
      promptVersion,
      toolsExecuted: [call.name],
      tokenUsage: {
        inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : null,
        outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
        totalTokens: typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : null,
        tokenCountsAvailable: typeof usage.promptTokenCount === 'number',
      },
    });
  } catch (error) {
    const meta = error.executionMetadata || {
      attempts: [{ attemptNumber: 1, durationMs: 0, status: 'failure', error: error.message }],
      totalAttempts: 1,
      durationMs: 0,
    };
    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:summary` : 'expenseAgent.summary',
      provider: 'google-genai',
      model,
      outcome: 'failure',
      durationMs: meta.durationMs,
      attempts: meta.attempts,
      totalAttempts: meta.totalAttempts,
      promptVersion,
      toolsExecuted: [call.name],
      error,
      tokenUsage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });
    throw error;
  }

  const answer = finalResponse.text?.trim();
  if (!answer) throw new Error('Gemini returned an empty final answer.');
  return { answer, toolName: call.name, toolResult };
}
