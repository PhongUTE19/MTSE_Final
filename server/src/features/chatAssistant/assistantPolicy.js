import { SERVER_MESSAGES } from '../../constants/index.js';
import { classifyScope, detectPromptInjection } from '../../shared/guardrails/index.js';
import { CHAT_HISTORY_MAX_TURNS, CHAT_MESSAGE_MAX_LENGTH } from './chatAssistant.schema.js';

export const TOOL_NAMES = Object.freeze({
  SEARCH_KNOWLEDGE_BASE: 'search_knowledge_base',
  SEARCH_TRANSACTIONS: 'search_transactions',
  GET_SPENDING_SUMMARY: 'get_spending_summary',
  PROPOSE_TRANSACTION: 'propose_transaction',
});

export const SCOPE_STATES = Object.freeze({
  OUT_OF_SCOPE: 'out_of_scope',
  UNKNOWN: 'unknown',
  IN_SCOPE: 'in_scope',
});

export const CAPABILITIES = Object.freeze({
  NONE: 'none',
  UNCLASSIFIED: 'unclassified',
  KB_DOCS: 'kb_docs',
  FINANCE_READ: 'finance_read',
  TRANSACTION_PROPOSAL: 'transaction_proposal',
  HYBRID: 'hybrid',
});

export const ASSISTANT_LIMITS = Object.freeze({
  MAX_ROUNDS: 4,
  MAX_TOOL_CALLS: 6,
  MAX_KB_SEARCHES: 2,
  MAX_PROPOSALS: 1,
  TOOL_TIMEOUT_MS: 10000,
  REQUEST_DEADLINE_MS: 30000,
  MAX_HISTORY_TURNS: CHAT_HISTORY_MAX_TURNS,
  MAX_HISTORY_TEXT_LENGTH: CHAT_MESSAGE_MAX_LENGTH,
});

const POLICY_CUE_PATTERN = /\b(spendwise|policy|policies|rule|rules|guide|documentation|docs|allowed|limit|limits|how\s+does|how\s+to|according\s+to|can\s+i\s+log|should\s+i\s+categorize|receipt\s+upload|retention)\b/i;
const FINANCE_READ_PATTERN = /\b(spend|spent|spending|summary|total|balance|income|expenses?|transactions?|bought|paid|how\s+much|search|find|list|show|last\s+week|this\s+month|today|yesterday)\b/i;
const QUESTION_QUERY_PREFIX = /^\s*(what|how|did|do|does|show|list|find|search|when|where|which|total|summary)\b/i;
const PROPOSAL_INTENT_PATTERN = /\b(log|record|add|create|save|propose|enter|track)\b.*\b(\d+|vnd|đ|₫|k|coffee|lunch|dinner|grab|taxi|salary|expense|income|transaction)\b|\b(bought|spent|paid|received|earned)\b.*\b\d+(?:[.,]\d+)?\s*(?:k|m|vnd|đ|₫)?\b/i;
const KB_DOCS_PATTERN = /\b(what\s+is\s+spendwise|how\s+does\s+spendwise|documentation|docs|policy|policies|rule|rules|feature|features|faq|help|guide|receipt\s+scanner|retention|privacy|admin|knowledge\s+base)\b/i;

/**
 * Sanitizes client-supplied conversation history.
 * Security rule (P2-T12): ONLY validated `user` text turns are retained.
 * Client-supplied assistant, system, tool, and functionCall/functionResponse turns are dropped.
 *
 * @param {unknown} rawHistory
 * @returns {{ valid: boolean, userTurns: Array<{ role: 'user', text: string }>, error?: string }}
 */
export function sanitizeClientHistory(rawHistory) {
  if (rawHistory === undefined || rawHistory === null) {
    return { valid: true, userTurns: [] };
  }
  if (!Array.isArray(rawHistory)) {
    return { valid: false, userTurns: [], error: 'History must be an array.' };
  }
  if (rawHistory.length > ASSISTANT_LIMITS.MAX_HISTORY_TURNS) {
    return {
      valid: false,
      userTurns: [],
      error: `History may contain at most ${ASSISTANT_LIMITS.MAX_HISTORY_TURNS} turns.`,
    };
  }

  const userTurns = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, userTurns: [], error: 'Malformed history item.' };
    }
    const { role, text, functionCall, functionResponse } = item;
    if (typeof role !== 'string' || !['user', 'assistant', 'system', 'tool'].includes(role)) {
      return { valid: false, userTurns: [], error: 'Unsupported history role.' };
    }

    // Drop any function call/response or non-user messages deterministically.
    if (functionCall !== undefined || functionResponse !== undefined || role !== 'user') {
      continue;
    }

    if (typeof text !== 'string' || !text.trim() || text.trim().length > ASSISTANT_LIMITS.MAX_HISTORY_TEXT_LENGTH) {
      return { valid: false, userTurns: [], error: 'Malformed user history message.' };
    }

    userTurns.push({ role: 'user', text: text.trim() });
  }

  return { valid: true, userTurns };
}

/**
 * Validates already-formatted trusted server-authoritative conversation history.
 * Preserves both `user` and `assistant` turns in chronological order without
 * passing them through the untrusted `sanitizeClientHistory` filter.
 *
 * @param {unknown} rawTrustedHistory
 * @returns {{ valid: boolean, turns: Array<{ role: 'user'|'assistant', text: string }>, error?: string }}
 */
export function validateTrustedHistory(rawTrustedHistory) {
  if (rawTrustedHistory === undefined || rawTrustedHistory === null) {
    return { valid: true, turns: [] };
  }
  if (!Array.isArray(rawTrustedHistory)) {
    return { valid: false, turns: [], error: 'Trusted history must be an array.' };
  }

  const turns = [];
  for (const item of rawTrustedHistory) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, turns: [], error: 'Malformed trusted history item.' };
    }
    const { role, text } = item;
    if (role !== 'user' && role !== 'assistant') {
      return { valid: false, turns: [], error: 'Unsupported trusted history role.' };
    }
    if (typeof text !== 'string' || !text.trim()) {
      return { valid: false, turns: [], error: 'Malformed trusted history message.' };
    }
    turns.push({ role, text: text.trim() });
  }

  return { valid: true, turns };
}

/**
 * Evaluates deterministic request scope, capability permissions, and KB evidence requirements.
 *
 * @param {{ message: string, history?: Array<unknown>, trustedHistory?: Array<unknown>|null }} input
 */
export function evaluateRequestPolicy({ message, history = [], trustedHistory = null } = {}) {
  const usingTrustedHistory = trustedHistory !== null && trustedHistory !== undefined;
  const historyCheck = usingTrustedHistory
    ? validateTrustedHistory(trustedHistory)
    : sanitizeClientHistory(history);
  const resolvedHistory = usingTrustedHistory ? historyCheck.turns : historyCheck.userTurns;

  if (!historyCheck.valid) {
    return {
      allowed: false,
      statusCode: 400,
      scopeState: SCOPE_STATES.OUT_OF_SCOPE,
      capability: CAPABILITIES.NONE,
      allowedTools: [],
      requiresKbEvidence: false,
      sanitizedHistory: [],
      refusalText: historyCheck.error,
    };
  }

  const injection = detectPromptInjection(message);
  if (injection.isInjection) {
    return {
      allowed: false,
      statusCode: 200,
      scopeState: SCOPE_STATES.OUT_OF_SCOPE,
      capability: CAPABILITIES.NONE,
      allowedTools: [],
      requiresKbEvidence: false,
      sanitizedHistory: [],
      refusalText: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL,
      guardrail: 'prompt_injection',
    };
  }

  for (const turn of resolvedHistory) {
    if (turn.role === 'user' && detectPromptInjection(turn.text).isInjection) {
      return {
        allowed: false,
        statusCode: 200,
        scopeState: SCOPE_STATES.OUT_OF_SCOPE,
        capability: CAPABILITIES.NONE,
        allowedTools: [],
        requiresKbEvidence: false,
        sanitizedHistory: [],
        refusalText: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL,
        guardrail: 'prompt_injection',
      };
    }
  }

  const scope = classifyScope(message);
  if (scope.isOutOfScope) {
    return {
      allowed: false,
      statusCode: 200,
      scopeState: SCOPE_STATES.OUT_OF_SCOPE,
      capability: CAPABILITIES.NONE,
      allowedTools: [],
      requiresKbEvidence: false,
      sanitizedHistory: resolvedHistory,
      refusalText: scope.refusalText || SERVER_MESSAGES.ERRORS.OUT_OF_SCOPE,
      guardrail: 'out_of_scope',
    };
  }

  const normalized = String(message || '').trim();
  const hasPolicyCue = POLICY_CUE_PATTERN.test(normalized) || KB_DOCS_PATTERN.test(normalized);
  const hasFinanceRead = FINANCE_READ_PATTERN.test(normalized);
  const hasProposalIntent = PROPOSAL_INTENT_PATTERN.test(normalized) && !QUESTION_QUERY_PREFIX.test(normalized);

  // Hybrid: both documentation/policy cues and finance intent (read or proposal)
  if (hasPolicyCue && (hasFinanceRead || hasProposalIntent)) {
    return {
      allowed: true,
      scopeState: SCOPE_STATES.IN_SCOPE,
      capability: CAPABILITIES.HYBRID,
      allowedTools: [
        TOOL_NAMES.SEARCH_KNOWLEDGE_BASE,
        TOOL_NAMES.SEARCH_TRANSACTIONS,
        TOOL_NAMES.GET_SPENDING_SUMMARY,
        TOOL_NAMES.PROPOSE_TRANSACTION,
      ],
      requiresKbEvidence: true,
      sanitizedHistory: resolvedHistory,
      refusalText: null,
    };
  }

  // Documentation-only question
  if (hasPolicyCue && !hasFinanceRead && !hasProposalIntent) {
    return {
      allowed: true,
      scopeState: SCOPE_STATES.IN_SCOPE,
      capability: CAPABILITIES.KB_DOCS,
      allowedTools: [TOOL_NAMES.SEARCH_KNOWLEDGE_BASE],
      requiresKbEvidence: true,
      sanitizedHistory: resolvedHistory,
      refusalText: null,
    };
  }

  // Transaction proposal without policy cues
  if (hasProposalIntent) {
    return {
      allowed: true,
      scopeState: SCOPE_STATES.IN_SCOPE,
      capability: CAPABILITIES.TRANSACTION_PROPOSAL,
      allowedTools: [TOOL_NAMES.PROPOSE_TRANSACTION],
      requiresKbEvidence: false,
      sanitizedHistory: resolvedHistory,
      refusalText: null,
    };
  }

  // Finance read-only query without policy cues
  if (hasFinanceRead) {
    return {
      allowed: true,
      scopeState: SCOPE_STATES.IN_SCOPE,
      capability: CAPABILITIES.FINANCE_READ,
      allowedTools: [TOOL_NAMES.SEARCH_TRANSACTIONS, TOOL_NAMES.GET_SPENDING_SUMMARY],
      requiresKbEvidence: false,
      sanitizedHistory: resolvedHistory,
      refusalText: null,
    };
  }

  // Ambiguous / unknown scope: read-only KB only, never finance tools
  return {
    allowed: true,
    scopeState: SCOPE_STATES.UNKNOWN,
    capability: CAPABILITIES.UNCLASSIFIED,
    allowedTools: [TOOL_NAMES.SEARCH_KNOWLEDGE_BASE],
    requiresKbEvidence: true,
    sanitizedHistory: resolvedHistory,
    refusalText: null,
  };
}

/**
 * Deterministic pre-execution gate evaluated before every tool call.
 *
 * @param {{ policy: object, toolName: string, state: { totalCalls: number, kbCalls: number, proposalCalls: number, kbStatus: string|null } }} params
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canExecuteTool({ policy, toolName, state }) {
  if (!policy?.allowed) {
    return { allowed: false, reason: 'Request is refused by policy.' };
  }

  if (!policy.allowedTools.includes(toolName)) {
    return { allowed: false, reason: `Tool "${toolName}" is not permitted for capability "${policy.capability}".` };
  }

  if (state.totalCalls >= ASSISTANT_LIMITS.MAX_TOOL_CALLS) {
    return { allowed: false, reason: 'Maximum tool execution limit reached.' };
  }

  if (toolName === TOOL_NAMES.SEARCH_KNOWLEDGE_BASE && state.kbCalls >= ASSISTANT_LIMITS.MAX_KB_SEARCHES) {
    return { allowed: false, reason: 'Maximum knowledge-base search limit reached.' };
  }

  if (toolName === TOOL_NAMES.PROPOSE_TRANSACTION) {
    if (state.proposalCalls >= ASSISTANT_LIMITS.MAX_PROPOSALS) {
      return { allowed: false, reason: 'Maximum transaction proposal limit reached.' };
    }
    if (policy.requiresKbEvidence && state.kbStatus !== 'SUFFICIENT') {
      return {
        allowed: false,
        reason: 'Policy-dependent transaction proposals require SUFFICIENT knowledge-base evidence before proposing.',
      };
    }
  }

  return { allowed: true };
}
