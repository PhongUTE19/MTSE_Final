import { config } from '../../config.js';
import { RETRY_CONFIG } from '../../constants/index.js';
import { recordUsage, hashPrompt } from '../aiUsage/index.js';
import { generateToolTurn, generateToolFollowup } from '../../shared/integrations/ai/index.js';
import { validateChatResponse } from '../../shared/guardrails/index.js';
import { getVietnamDate } from '../../shared/validation/date.js';
import { getExpenseAssistantPrompt } from './expenseAssistantPrompt.js';

export { getVietnamDate };

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
export function setGeminiExpenseAssistantClientFactoryForTests(factory) { clientFactory = factory; }
export function getGeminiExpenseAssistantClientForTests() { return clientFactory ? clientFactory() : undefined; }

function getClientOverride(options) {
  if (options.ai) return options.ai;
  return clientFactory ? clientFactory() : undefined;
}

function safeRecordUsage(recordData) {
  try {
    recordUsage(recordData);
  } catch (error) {
    // Non-fatal: Tracking failures must never disrupt user requests or financial flows
    console.error('[ExpenseAgent] Failed to record usage (non-fatal):', error.message);
  }
}

function resolveExpenseAssistantPrompt(agentType, today, customInstruction) {
  if (customInstruction) {
    const hash = hashPrompt(customInstruction);
    return {
      text: customInstruction,
      promptId: 'custom',
      promptVersion: null,
      promptHash: hash,
      version: hash,
    };
  }

  const resolved = getExpenseAssistantPrompt(agentType, { today });
  return {
    text: resolved.text,
    promptId: resolved.id,
    promptVersion: resolved.baseVersion,
    promptHash: hashPrompt(resolved.text),
    version: resolved.version,
  };
}

const EXPENSE_ASSISTANT_TIMEOUT_MS = 15000;

const AGENT_TOOL_DECLARATIONS = Object.freeze({
  summary: [SPENDING_SUMMARY_TOOL],
  create: [CREATE_TRANSACTION_TOOL],
  assistant: [SEARCH_TRANSACTIONS_TOOL, SPENDING_SUMMARY_TOOL, CREATE_TRANSACTION_TOOL],
  search: [SEARCH_TRANSACTIONS_TOOL],
});

/** Runs exactly one tool-calling turn (if needed), then returns a natural-language summary. */
export async function runGeminiExpenseAssistant(message, executeTool, options = {}) {
  const aiOverride = getClientOverride(options);
  const model = options.model || config.geminiModel;
  const timeoutMs = options.timeoutMs ?? EXPENSE_ASSISTANT_TIMEOUT_MS;
  const today = options.today || getVietnamDate();
  const promptResolution = resolveExpenseAssistantPrompt(options.agentType, today, options.systemInstruction);
  const instruction = promptResolution.text;
  const declarations = AGENT_TOOL_DECLARATIONS[options.agentType] || AGENT_TOOL_DECLARATIONS.search;

  const feature = options.feature || 'expense_agent';
  const promptId = options.promptId || promptResolution.promptId;
  const promptVersion = options.promptVersion || promptResolution.promptVersion;
  const promptHash = options.promptHash || promptResolution.promptHash;
  const maxRetries = options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;
  const initialDelayMs = options.initialDelayMs ?? RETRY_CONFIG.INITIAL_DELAY_MS;

  let firstTurn;
  try {
    firstTurn = await generateToolTurn(
      {
        prompt: message,
        systemInstruction: instruction,
        tools: declarations,
        model,
        timeoutMs,
        maxRetries,
        initialDelayMs,
        timeoutMessage: 'Expense search timed out.',
        ai: aiOverride,
      },
      { provider: options.provider }
    );

    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:tool_selection` : 'expenseAgent.toolSelection',
      provider: firstTurn.provider,
      model: firstTurn.model,
      outcome: firstTurn.isRefusal ? 'refusal' : 'success',
      isRefusal: firstTurn.isRefusal,
      refusalReason: firstTurn.isRefusal ? firstTurn.finishReason : null,
      durationMs: firstTurn.durationMs,
      attempts: firstTurn.attempts,
      totalAttempts: firstTurn.totalAttempts,
      promptId,
      promptVersion,
      promptHash,
      toolsExecuted: [],
      tokenUsage: firstTurn.tokenUsage,
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
      promptId,
      promptVersion,
      promptHash,
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

  const call = firstTurn.toolCall;
  if (!call) {
    const clarification = firstTurn.text;
    if (!clarification) throw new Error('Gemini returned neither a function call nor a clarification.');
    const validated = validateChatResponse(clarification);
    return { answer: validated.answer, toolName: null, toolResult: null, promptId, promptVersion, promptHash };
  }

  const toolResult = await executeTool(call.name, call.args || {});

  let finalTurn;
  try {
    finalTurn = await generateToolFollowup(
      {
        prompt: message,
        systemInstruction: instruction,
        rawAssistantContent: firstTurn.rawAssistantContent,
        toolName: call.name,
        toolResult,
        model,
        timeoutMs,
        maxRetries,
        initialDelayMs,
        timeoutMessage: 'Expense search timed out.',
        ai: aiOverride,
      },
      { provider: options.provider }
    );

    safeRecordUsage({
      feature,
      operation: options.operation ? `${options.operation}:summary` : 'expenseAgent.summary',
      provider: finalTurn.provider,
      model: finalTurn.model,
      outcome: finalTurn.isRefusal ? 'refusal' : 'success',
      isRefusal: finalTurn.isRefusal,
      refusalReason: finalTurn.isRefusal ? finalTurn.finishReason : null,
      durationMs: finalTurn.durationMs,
      attempts: finalTurn.attempts,
      totalAttempts: finalTurn.totalAttempts,
      promptId,
      promptVersion,
      promptHash,
      toolsExecuted: [call.name],
      tokenUsage: finalTurn.tokenUsage,
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
      promptId,
      promptVersion,
      promptHash,
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

  const answer = finalTurn.text;
  if (!answer) throw new Error('Gemini returned an empty final answer.');
  const validated = validateChatResponse(answer);
  return { answer: validated.answer, toolName: call.name, toolResult, promptVersion };
}
