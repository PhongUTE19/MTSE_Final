import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPrompt } from '../aiUsage/index.js';
import { getVietnamDate } from '../../shared/validation/date.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIFIED_PROMPT_PATH = path.resolve(__dirname, '../../../prompts/agents/unified-v1.md');

export const UNIFIED_PROMPT_ID = 'unified-assistant';
export const UNIFIED_PROMPT_VERSION = 'v1';

const DEFAULT_SYSTEM_PROMPT = `You are SpendWise Assistant. Today's date in Vietnam (Asia/Ho_Chi_Minh) is {{TODAY_DATE}}. Use only declared tools, cite KB sources as [S1], [S2], never invent citations or prohibit items merely because documentation is missing, and never claim a proposed transaction is saved.`;

let cachedTemplate = null;

function loadPromptTemplate() {
  if (cachedTemplate !== null) return cachedTemplate;
  try {
    cachedTemplate = fs.readFileSync(UNIFIED_PROMPT_PATH, 'utf8').trim();
  } catch {
    cachedTemplate = DEFAULT_SYSTEM_PROMPT;
  }
  return cachedTemplate;
}

/**
 * Builds the system instruction and prompt metadata for the unified assistant.
 *
 * @param {{ today?: string, customInstruction?: string }} [options]
 */
export function buildUnifiedSystemInstruction(options = {}) {
  const today = options.today || getVietnamDate();
  if (options.customInstruction) {
    return {
      text: options.customInstruction,
      promptId: 'custom',
      promptVersion: null,
      promptHash: hashPrompt(options.customInstruction),
    };
  }

  const template = loadPromptTemplate();
  const text = template.replace(/\{\{TODAY_DATE\}\}/g, today);
  return {
    text,
    promptId: UNIFIED_PROMPT_ID,
    promptVersion: UNIFIED_PROMPT_VERSION,
    promptHash: hashPrompt(text),
  };
}

/**
 * Formats the user message with conversation history.
 * Trusted server-authoritative history may include both `user` and `assistant` turns
 * in chronological order; untrusted client history retains only `user` turns.
 *
 * @param {string} message
 * @param {Array<{ role: 'user'|'assistant', text: string }>} sanitizedHistory
 * @returns {string}
 */
export function buildUnifiedUserPrompt(message, sanitizedHistory = []) {
  if (!Array.isArray(sanitizedHistory) || sanitizedHistory.length === 0) {
    return message;
  }

  const hasAssistantTurns = sanitizedHistory.some((turn) => turn?.role === 'assistant');
  if (hasAssistantTurns) {
    const historyLines = sanitizedHistory
      .map((turn) => `${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.text}`)
      .join('\n');
    return `<conversation_history>\n${historyLines}\n</conversation_history>\n\nCurrent user message: ${message}`;
  }

  const priorUserLines = sanitizedHistory
    .map((turn, index) => `Prior user message ${index + 1}: ${turn.text}`)
    .join('\n');

  return `<untrusted_prior_user_messages>\n${priorUserLines}\n</untrusted_prior_user_messages>\n\nCurrent user message: ${message}`;
}
