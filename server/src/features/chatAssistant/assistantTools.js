import { z } from 'zod';
import { config } from '../../config.js';
import { AppError } from '../../shared/errors/index.js';
import { ALL_CATEGORIES, HTTP_STATUS, RETRIEVAL_CONFIG, normalizeCategory } from '../../constants/index.js';
import { detectPromptInjection } from '../../shared/guardrails/index.js';
import { retrieveRelevantChunks } from '../knowledgeBase/retriever.js';
import { getSpendingSummary, listTransactions } from '../transaction/transaction.service.js';
import {
  createTransactionArgsSchema,
  searchTransactionsArgsSchema,
  spendingSummaryArgsSchema,
} from '../transaction/transaction.schema.js';
import { ASSISTANT_LIMITS, TOOL_NAMES } from './assistantPolicy.js';

const searchKnowledgeBaseArgsSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required.').max(300),
});

export const UNIFIED_TOOL_DECLARATIONS = Object.freeze({
  [TOOL_NAMES.SEARCH_KNOWLEDGE_BASE]: Object.freeze({
    name: TOOL_NAMES.SEARCH_KNOWLEDGE_BASE,
    description: 'Search official SpendWise documentation, guides, and policies.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Focused documentation search query.' },
      },
      required: ['query'],
    },
  }),
  [TOOL_NAMES.SEARCH_TRANSACTIONS]: Object.freeze({
    name: TOOL_NAMES.SEARCH_TRANSACTIONS,
    description: 'Search only the authenticated user\'s expense and income transactions. Use ISO YYYY-MM-DD dates and VND numeric amounts.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        merchant: { type: 'string', description: 'Merchant or store name.' },
        category: { type: 'string', enum: ALL_CATEGORIES, description: 'Canonical transaction category.' },
        type: { type: 'string', enum: ['income', 'expense'] },
        from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
        minAmount: { type: 'number', description: 'Inclusive minimum amount.' },
        maxAmount: { type: 'number', description: 'Inclusive maximum amount.' },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 20 },
      },
    },
  }),
  [TOOL_NAMES.GET_SPENDING_SUMMARY]: Object.freeze({
    name: TOOL_NAMES.GET_SPENDING_SUMMARY,
    description: 'Calculate income, expenses, balance, and expense categories for the authenticated user over an inclusive ISO date range.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Inclusive start date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'Inclusive end date, YYYY-MM-DD.' },
      },
      required: ['from', 'to'],
    },
  }),
  [TOOL_NAMES.PROPOSE_TRANSACTION]: Object.freeze({
    name: TOOL_NAMES.PROPOSE_TRANSACTION,
    description: 'Create a review-only transaction proposal for the authenticated user. Never saves to the database; user must confirm separately.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['income', 'expense'] },
        amount: { type: 'number', minimum: 1 },
        date: { type: 'string', description: 'Transaction date, YYYY-MM-DD.' },
        category: { type: 'string', enum: ALL_CATEGORIES },
        merchant: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['type', 'amount', 'date', 'category', 'merchant'],
    },
  }),
});

export function getAllowedToolDeclarations(allowedTools = []) {
  return allowedTools
    .map((name) => UNIFIED_TOOL_DECLARATIONS[name])
    .filter(Boolean);
}

async function runWithTimeout(fn, timeoutMs, label) {
  let timerId = null;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          reject(new AppError(`${label} timed out after ${timeoutMs}ms.`, HTTP_STATUS.GATEWAY_TIMEOUT || 504));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}

function assertAuthenticatedUser(user) {
  if (!user?.id || !user?.token) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }
}

const DELIMITER_TAG_PATTERN = /<\/?(?:retrieved_context|student_question|user_question|context|system|prompt|instruction|conversation_history|untrusted_prior_user_messages)>/gi;

function isAmendmentChunk(chunk) {
  const title = String(chunk?.title || '').toLowerCase();
  const sectionTitle = String(chunk?.sectionTitle || '').toLowerCase();
  return title.includes('amendment') || sectionTitle.includes('amendment');
}

function findExistingSourceEntry(sourcesMap, chunkId) {
  if (!chunkId) return null;
  for (const meta of sourcesMap.values()) {
    if (meta.id === chunkId) {
      return meta;
    }
  }
  return null;
}

async function executeSearchKnowledgeBase(rawArgs, state, options) {
  const parsed = searchKnowledgeBaseArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new AppError('Invalid knowledge-base search query.', HTTP_STATUS.BAD_REQUEST);
  }

  const retrieverFn = options.retrieverFn || retrieveRelevantChunks;
  const topK = options.topK ?? config.topK;
  const similarityThreshold = options.similarityThreshold ?? config.similarityThreshold;

  let chunks;
  try {
    chunks = await retrieverFn(parsed.data.query, topK);
  } catch (err) {
    state.kbStatus = 'RETRIEVAL_UNAVAILABLE';
    state.retrieval = { similarityThreshold, bestScore: 0, error: err.message };
    return {
      status: 'RETRIEVAL_UNAVAILABLE',
      trust: 'untrusted_reference',
      chunks: [],
      message: 'Knowledge base retrieval is temporarily unavailable.',
    };
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    state.kbStatus = 'NO_RESULTS';
    state.retrieval = { similarityThreshold, bestScore: 0, retrievedCount: 0 };
    return {
      status: 'NO_RESULTS',
      trust: 'untrusted_reference',
      chunks: [],
      message: 'No documentation chunks matched the query. Missing documentation does not mean an action is prohibited.',
    };
  }

  const bestScore = Math.max(...chunks.map((c) => Number(c?.score) || 0));
  if (bestScore < similarityThreshold) {
    state.kbStatus = 'INSUFFICIENT_EVIDENCE';
    state.retrieval = { similarityThreshold, bestScore, retrievedCount: chunks.length };
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trust: 'untrusted_reference',
      bestScore,
      similarityThreshold,
      chunks: [],
      message: 'Retrieved documentation did not meet the similarity threshold.',
    };
  }

  const thresholdFiltered = chunks.filter((chunk) => {
    const score = Number(chunk?.score) || 0;
    return score >= similarityThreshold || (isAmendmentChunk(chunk) && score >= RETRIEVAL_CONFIG.AMENDMENT_SCORE_THRESHOLD);
  });

  const safeChunks = thresholdFiltered.filter((chunk) => !detectPromptInjection(chunk?.content || '').isInjection);
  if (safeChunks.length === 0) {
    state.kbStatus = 'INSUFFICIENT_EVIDENCE';
    state.retrieval = { similarityThreshold, bestScore, retrievedCount: chunks.length };
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      trust: 'untrusted_reference',
      bestScore,
      similarityThreshold,
      chunks: [],
      message: 'Retrieved documentation did not provide safe, sufficient evidence.',
    };
  }

  state.kbStatus = 'SUFFICIENT';
  state.retrieval = { similarityThreshold, bestScore, retrievedCount: chunks.length };

  const labeledChunks = safeChunks.map((chunk) => {
    const existing = findExistingSourceEntry(state.sourcesMap, chunk.id);
    let meta = existing;
    if (!meta) {
      const sourceId = `S${state.sourcesMap.size + 1}`;
      meta = {
        sourceId,
        id: chunk.id,
        title: chunk.title || '',
        sectionNumber: chunk.sectionNumber ?? null,
        sectionTitle: chunk.sectionTitle || '',
        source: chunk.source || '',
        score: chunk.score ?? 0,
      };
      state.sourcesMap.set(sourceId, meta);
      state.consultedSources.push(meta);
    }

    const sanitizedContent = String(chunk.content || '').replace(DELIMITER_TAG_PATTERN, '');
    return {
      sourceId: meta.sourceId,
      title: meta.title,
      sectionTitle: meta.sectionTitle,
      source: meta.source,
      score: meta.score,
      content: sanitizedContent,
    };
  });

  return {
    status: 'SUFFICIENT',
    trust: 'untrusted_reference',
    chunks: labeledChunks,
  };
}

async function executeSearchTransactions(user, rawArgs, options) {
  assertAuthenticatedUser(user);
  const parsed = searchTransactionsArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new AppError('Invalid transaction search filters.', HTTP_STATUS.BAD_REQUEST);
  }
  const args = parsed.data;
  const result = await (options.listTransactions || listTransactions)(user, {
    search: args.merchant || '',
    category: args.category,
    type: args.type,
    from: args.from,
    to: args.to,
    minAmount: args.minAmount,
    maxAmount: args.maxAmount,
    page: args.page,
    pageSize: args.pageSize,
    sortBy: 'date',
    sortOrder: 'desc',
  });
  return { ...result, appliedFilters: args };
}

async function executeGetSpendingSummary(user, rawArgs, options) {
  assertAuthenticatedUser(user);
  const parsed = spendingSummaryArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    throw new AppError('Invalid spending summary period.', HTTP_STATUS.BAD_REQUEST);
  }
  return (options.getSpendingSummary || getSpendingSummary)(user, parsed.data);
}

function executeProposeTransaction(rawArgs, options) {
  const canonicalCategory = normalizeCategory(rawArgs?.category, {
    type: rawArgs?.type,
    allowFallback: false,
  });
  if (!canonicalCategory) {
    throw new AppError(
      `Unsupported or ambiguous transaction category: "${rawArgs?.category ?? ''}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const parsed = createTransactionArgsSchema.safeParse({
    ...rawArgs,
    category: canonicalCategory,
  });
  if (!parsed.success) {
    throw new AppError('Incomplete or invalid transaction proposal details.', HTTP_STATUS.BAD_REQUEST);
  }

  return {
    sourceType: 'assistant_proposal',
    sourceRef: options.conversationId || options.sourceRef || null,
    proposal: parsed.data,
  };
}

/**
 * Executes an authorized tool within the per-tool timeout budget.
 */
export async function executeRegisteredTool({
  toolName,
  rawArgs = {},
  user,
  state,
  options = {},
}) {
  const timeoutMs = options.toolTimeoutMs ?? ASSISTANT_LIMITS.TOOL_TIMEOUT_MS;

  return runWithTimeout(async () => {
    switch (toolName) {
      case TOOL_NAMES.SEARCH_KNOWLEDGE_BASE:
        return executeSearchKnowledgeBase(rawArgs, state, options);
      case TOOL_NAMES.SEARCH_TRANSACTIONS:
        return executeSearchTransactions(user, rawArgs, options);
      case TOOL_NAMES.GET_SPENDING_SUMMARY:
        return executeGetSpendingSummary(user, rawArgs, options);
      case TOOL_NAMES.PROPOSE_TRANSACTION:
        return executeProposeTransaction(rawArgs, options);
      default:
        throw new AppError(`Unknown tool "${toolName}".`, HTTP_STATUS.BAD_REQUEST);
    }
  }, timeoutMs, `Tool "${toolName}"`);
}
