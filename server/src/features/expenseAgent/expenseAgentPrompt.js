import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPrompt } from '../analytics/usageTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDirectory = path.resolve(__dirname, '../../../prompts/expenseAgent');

/**
 * Stable prompt identifiers for the approved Expense Agent workflows.
 */
export const EXPENSE_AGENT_PROMPT_IDS = Object.freeze({
  SEARCH: 'expense_agent_search',
  SUMMARY: 'expense_agent_summary',
  CREATE: 'expense_agent_create',
  ASSISTANT: 'expense_agent_assistant',
  CONTEXT: 'expense_agent_context',
});

export const EXPENSE_AGENT_PROMPT_VERSION = process.env.EXPENSE_AGENT_PROMPT_VERSION || 'v1';

const PROMPT_FILE_PREFIX = Object.freeze({
  [EXPENSE_AGENT_PROMPT_IDS.SEARCH]: 'search',
  [EXPENSE_AGENT_PROMPT_IDS.SUMMARY]: 'summary',
  [EXPENSE_AGENT_PROMPT_IDS.CREATE]: 'create',
  [EXPENSE_AGENT_PROMPT_IDS.ASSISTANT]: 'assistant',
  [EXPENSE_AGENT_PROMPT_IDS.CONTEXT]: 'context',
});

const BUILTIN_FALLBACKS = Object.freeze({
  [EXPENSE_AGENT_PROMPT_IDS.SEARCH]: 'You are the transaction-search assistant for the authenticated user. Today is {{today}}. You must use search_transactions to answer every transaction lookup. Answer concisely in English.',
  [EXPENSE_AGENT_PROMPT_IDS.SUMMARY]: 'You are the spending-summary assistant for the authenticated user. Today is {{today}} in Asia/Ho_Chi_Minh. You must use get_spending_summary for every summary request. Answer concisely in English.',
  [EXPENSE_AGENT_PROMPT_IDS.CREATE]: 'You create transaction proposals only for the authenticated user. Today is {{today}} in Asia/Ho_Chi_Minh. Use create_transaction to prepare a proposal. The tool only creates a proposal, never a saved transaction.',
  [EXPENSE_AGENT_PROMPT_IDS.ASSISTANT]: 'You are an AI expense assistant for the authenticated user. Today is {{today}} in Asia/Ho_Chi_Minh. Choose exactly one declared tool (search_transactions, get_spending_summary, create_transaction) and answer concisely.',
  [EXPENSE_AGENT_PROMPT_IDS.CONTEXT]: 'Conversation context:\n{{context}}\n\nCurrent user request: {{message}}',
});

/**
 * Replaces dynamic variables such as {{today}} in template strings.
 *
 * @param {string} template - Raw prompt template
 * @param {Record<string, any>} [variables={}] - Key-value map
 * @returns {string} Rendered prompt string
 */
export function renderExpenseAgentPrompt(template, variables = {}) {
  if (!template || typeof template !== 'string') return '';
  if (!variables || typeof variables !== 'object') return template;

  let rendered = template;
  for (const [key, val] of Object.entries(variables)) {
    if (val !== undefined && val !== null) {
      const escapedKey = key.replace(/[-\\/\\^$*+?.()|[\\]{}]/g, '\\$&');
      rendered = rendered.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}|\\$\\{${escapedKey}\\}`, 'g'), String(val));
    }
  }
  return rendered;
}

/**
 * Computes a deterministic version-controlled prompt version identifier.
 *
 * @param {string} promptId - Registered prompt ID
 * @param {string} baseVersion - Base version string (e.g. 'v1')
 * @param {string} content - Rendered prompt content
 * @returns {string} Deterministic prompt version string
 */
export function computeExpenseAgentPromptVersion(promptId, baseVersion, content) {
  const hash = hashPrompt(content) || 'unhashed';
  return `${promptId}:${baseVersion || 'v1'}:${hash}`;
}

/**
 * Loads and resolves a versioned prompt for the specified expense agent type.
 *
 * @param {string} agentType - 'search', 'summary', 'create', or 'assistant'
 * @param {object} [options={}]
 * @param {string} [options.today] - Date string for relative date resolution
 * @param {string} [options.version=EXPENSE_AGENT_PROMPT_VERSION] - Requested version (e.g. 'v1')
 * @param {string} [options.override] - Optional runtime prompt override
 * @returns {{
 *   id: string,
 *   baseVersion: string,
 *   version: string,
 *   text: string,
 *   rawTemplate: string,
 *   isOverride: boolean
 * }}
 */
export function getExpenseAgentPrompt(agentType, options = {}) {
  const promptId = agentType === 'summary'
    ? EXPENSE_AGENT_PROMPT_IDS.SUMMARY
    : agentType === 'create'
      ? EXPENSE_AGENT_PROMPT_IDS.CREATE
      : agentType === 'assistant'
        ? EXPENSE_AGENT_PROMPT_IDS.ASSISTANT
        : agentType === 'context'
          ? EXPENSE_AGENT_PROMPT_IDS.CONTEXT
          : EXPENSE_AGENT_PROMPT_IDS.SEARCH;

  const requestedVersion = options.version || EXPENSE_AGENT_PROMPT_VERSION;
  let rawTemplate = '';
  let isOverride = false;
  let baseVersion = requestedVersion;

  if (typeof options.override === 'string' && options.override.trim()) {
    rawTemplate = options.override.trim();
    isOverride = true;
  } else {
    const filePrefix = PROMPT_FILE_PREFIX[promptId] || 'search';
    const filePath = path.join(promptsDirectory, `${filePrefix}-${requestedVersion}.md`);

    try {
      if (fs.existsSync(filePath)) {
        rawTemplate = fs.readFileSync(filePath, 'utf-8').trim();
      } else {
        // Fallback to default version if custom version file is missing
        const defaultPath = path.join(promptsDirectory, `${filePrefix}-${EXPENSE_AGENT_PROMPT_VERSION}.md`);
        if (fs.existsSync(defaultPath)) {
          console.warn(`[ExpenseAgentPrompt] Prompt "${promptId}" version "${requestedVersion}" not found. Falling back to default "${EXPENSE_AGENT_PROMPT_VERSION}".`);
          rawTemplate = fs.readFileSync(defaultPath, 'utf-8').trim();
          baseVersion = EXPENSE_AGENT_PROMPT_VERSION;
        } else {
          rawTemplate = BUILTIN_FALLBACKS[promptId] || '';
        }
      }
    } catch (err) {
      console.warn(`[ExpenseAgentPrompt] Error loading prompt from disk: ${err.message}. Using built-in fallback.`);
      rawTemplate = BUILTIN_FALLBACKS[promptId] || '';
    }
  }

  const variables = {
    ...(options.today ? { today: options.today } : {}),
    ...(options.variables || {}),
  };
  const renderedText = renderExpenseAgentPrompt(rawTemplate, variables);
  const version = computeExpenseAgentPromptVersion(promptId, baseVersion, renderedText);

  return {
    id: promptId,
    baseVersion,
    version,
    text: renderedText,
    rawTemplate,
    isOverride,
  };
}

export function systemInstruction(today, options = {}) {
  return getExpenseAgentPrompt('search', { today, ...options }).text;
}

export function summarySystemInstruction(today, options = {}) {
  return getExpenseAgentPrompt('summary', { today, ...options }).text;
}

export function createSystemInstruction(today, options = {}) {
  return getExpenseAgentPrompt('create', { today, ...options }).text;
}

export function assistantSystemInstruction(today, options = {}) {
  return getExpenseAgentPrompt('assistant', { today, ...options }).text;
}

/**
 * Formats conversation history and user message into prompt format using context-v1.md.
 *
 * @param {string} context - Formatted history turns
 * @param {string} message - Current user message
 * @param {object} [options={}]
 * @returns {string} Prompt string
 */
export function formatConversationContext(context, message, options = {}) {
  if (!context || !context.trim()) return message;
  return getExpenseAgentPrompt('context', {
    ...options,
    variables: { context: context.trim(), message: message.trim() },
  }).text;
}
