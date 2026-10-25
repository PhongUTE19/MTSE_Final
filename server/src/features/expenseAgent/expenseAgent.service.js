import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createTransaction, getSpendingSummary, listTransactions } from '../expenses/expenses.service.js';
import { createTransactionArgsSchema, searchTransactionsArgsSchema, spendingSummaryArgsSchema } from './expenseAgent.schemas.js';
import { runGeminiExpenseAgent } from './geminiExpenseAgent.js';

const MAX_AGENT_STEPS = 2; // Gemini calls tool once, then summarizes response.
const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const proposals = new Map();
let now = () => Date.now();

export async function searchTransactionsForUser(user, message, options = {}) {
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
    return await (options.agentRunner || runGeminiExpenseAgent)(message, executeTool, options);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Do not log prompts, tokens, parameters or raw provider errors to protect financial data.
    console.error('[ExpenseAgent] Search failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Expense search is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function getSpendingSummaryForUser(user, message, options = {}) {
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
    return await (options.agentRunner || runGeminiExpenseAgent)(message, executeTool, {
      ...options, agentType: 'summary',
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Summary failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Expense summary is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

function getOwnedPendingProposal(user, proposalId) {
  const proposal = proposals.get(proposalId);
  if (!proposal || proposal.userId !== user.id) throw new AppError('Transaction proposal was not found.', HTTP_STATUS.NOT_FOUND);
  if (proposal.expiresAt <= now()) { proposals.delete(proposalId); throw new AppError('Transaction proposal has expired. Please create a new one.', HTTP_STATUS.BAD_REQUEST); }
  if (proposal.status !== 'pending') throw new AppError('Transaction proposal has already been processed.', HTTP_STATUS.CONFLICT);
  return proposal;
}

function createProposalFromArgs(user, rawArgs) {
  const parsed = createTransactionArgsSchema.safeParse(rawArgs);
  if (!parsed.success) throw new AppError('Gemini returned incomplete or invalid transaction details.', HTTP_STATUS.BAD_REQUEST);
  const id = crypto.randomUUID();
  const proposal = { id, userId: user.id, transaction: parsed.data, status: 'pending', expiresAt: now() + PROPOSAL_TTL_MS };
  proposals.set(id, proposal);
  // Proposal is kept temporarily in memory; createTransaction/Supabase not called yet.
  return { proposal: { id, transaction: proposal.transaction, expiresAt: new Date(proposal.expiresAt).toISOString() } };
}

export async function createTransactionProposalForUser(user, message, options = {}) {
  const executeTool = async (toolName, rawArgs) => {
    if (toolName !== 'create_transaction') throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);
    return createProposalFromArgs(user, rawArgs);
  };
  try {
    return await (options.agentRunner || runGeminiExpenseAgent)(message, executeTool, { ...options, agentType: 'create' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Proposal failed', { name: error?.name || 'UnknownError' });
    throw new AppError('Transaction proposal is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/** Single chat endpoint where Gemini selects 1 of 3 declared tools. */
export async function runExpenseAssistantForUser(user, message, options = {}) {
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
    if (toolName === 'create_transaction') return createProposalFromArgs(user, rawArgs);
    throw new AppError('Unsupported expense agent tool.', HTTP_STATUS.BAD_REQUEST);
  };

  try {
    const context = (options.history || []).map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.text}`).join('\n');
    // Only send validated conversation turns; identity and authorization always derive from JWT.
    const prompt = context ? `Conversation context:\n${context}\n\nCurrent user request: ${message}` : message;
    return await (options.agentRunner || runGeminiExpenseAgent)(prompt, executeTool, { ...options, agentType: 'assistant' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[ExpenseAgent] Assistant failed', { name: error?.name || 'UnknownError' });
    throw new AppError('AI expense assistant is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

export async function confirmTransactionProposal(user, proposalId, transaction, options = {}) {
  const proposal = getOwnedPendingProposal(user, proposalId);
  const parsed = createTransactionArgsSchema.safeParse(transaction);
  if (!parsed.success) throw new AppError('Transaction confirmation is invalid.', HTTP_STATUS.BAD_REQUEST);
  // Mark processing before await so double-clicks do not create duplicate transactions.
  proposal.status = 'processing';
  try {
    const saved = await (options.createTransaction || createTransaction)(user, parsed.data);
    proposal.status = 'confirmed';
    proposals.delete(proposalId);
    return saved;
  } catch (error) {
    proposal.status = 'pending';
    throw error;
  }
}

export function cancelTransactionProposal(user, proposalId) {
  getOwnedPendingProposal(user, proposalId);
  proposals.delete(proposalId);
  return { id: proposalId, cancelled: true };
}

export function clearTransactionProposalsForTests() { proposals.clear(); }
export function setProposalClockForTests(clock) { now = clock || (() => Date.now()); }
