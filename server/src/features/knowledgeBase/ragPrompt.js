import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPrompt } from '../analytics/usageTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const promptsDirectory = path.resolve(__dirname, '../../../prompts/knowledgeBase');

/**
 * Stable prompt identifiers for Knowledge Base / RAG capabilities.
 */
export const RAG_PROMPT_IDS = Object.freeze({
  GROUNDED: 'rag_grounded',
  SYSTEM: 'rag_system',
});

export const RAG_PROMPT_VERSION = process.env.RAG_PROMPT_VERSION || 'v1';

const PROMPT_FILE_PREFIX = Object.freeze({
  [RAG_PROMPT_IDS.GROUNDED]: 'grounded',
  [RAG_PROMPT_IDS.SYSTEM]: 'system',
});

const BUILTIN_FALLBACKS = Object.freeze({
  [RAG_PROMPT_IDS.GROUNDED]: '{{systemPrompt}}\n\n=== UNTRUSTED REFERENCE CONTEXT ===\n<retrieved_context>\nContext:\n{{context}}\n</retrieved_context>\n\n=== UNTRUSTED USER QUERY ===\n<student_question>\nUser Question:\n{{question}}\n</student_question>\n\nAnswer:',
  [RAG_PROMPT_IDS.SYSTEM]: 'You are the SpendWise Assistant. Answer the user\'s question using ONLY the provided context.',
});

/**
 * Replaces dynamic variables such as {{systemPrompt}}, {{context}}, {{question}} in template strings.
 *
 * @param {string} template - Raw prompt template
 * @param {Record<string, any>} [variables={}] - Key-value map
 * @returns {string} Rendered prompt string
 */
export function renderRagPrompt(template, variables = {}) {
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
export function computeRagPromptVersion(promptId, baseVersion, content) {
  const hash = hashPrompt(content) || 'unhashed';
  return `${promptId}:${baseVersion || 'v1'}:${hash}`;
}

/**
 * Loads and resolves a versioned prompt for the specified RAG prompt type.
 *
 * @param {string} promptType - 'grounded' or 'system'
 * @param {object} [options={}]
 * @param {string} [options.version=RAG_PROMPT_VERSION] - Requested version (e.g. 'v1')
 * @param {string} [options.override] - Optional runtime prompt override
 * @param {Record<string, any>} [options.variables={}] - Dynamic variable map
 * @returns {{
 *   id: string,
 *   baseVersion: string,
 *   version: string,
 *   text: string,
 *   rawTemplate: string,
 *   isOverride: boolean
 * }}
 */
export function getRagPrompt(promptType, options = {}) {
  const promptId = promptType === 'system'
    ? RAG_PROMPT_IDS.SYSTEM
    : RAG_PROMPT_IDS.GROUNDED;

  const requestedVersion = options.version || RAG_PROMPT_VERSION;
  let rawTemplate = '';
  let isOverride = false;
  let baseVersion = requestedVersion;

  if (typeof options.override === 'string' && options.override.trim()) {
    rawTemplate = options.override.trim();
    isOverride = true;
  } else {
    const filePrefix = PROMPT_FILE_PREFIX[promptId] || 'grounded';
    const filePath = path.join(promptsDirectory, `${filePrefix}-${requestedVersion}.md`);

    try {
      if (fs.existsSync(filePath)) {
        rawTemplate = fs.readFileSync(filePath, 'utf-8').trim();
      } else {
        const defaultPath = path.join(promptsDirectory, `${filePrefix}-${RAG_PROMPT_VERSION}.md`);
        if (fs.existsSync(defaultPath)) {
          console.warn(`[RagPrompt] Prompt "${promptId}" version "${requestedVersion}" not found. Falling back to default "${RAG_PROMPT_VERSION}".`);
          rawTemplate = fs.readFileSync(defaultPath, 'utf-8').trim();
          baseVersion = RAG_PROMPT_VERSION;
        } else {
          rawTemplate = BUILTIN_FALLBACKS[promptId] || '';
        }
      }
    } catch (err) {
      console.warn(`[RagPrompt] Error loading prompt from disk: ${err.message}. Using built-in fallback.`);
      rawTemplate = BUILTIN_FALLBACKS[promptId] || '';
    }
  }

  const variables = options.variables || {};
  const renderedText = renderRagPrompt(rawTemplate, variables);
  const version = computeRagPromptVersion(promptId, baseVersion, renderedText);

  return {
    id: promptId,
    baseVersion,
    version,
    text: renderedText,
    rawTemplate,
    isOverride,
  };
}

/**
 * Returns complete version details for the RAG prompt, including content hash.
 *
 * @param {string} promptType - 'grounded' or 'system'
 * @param {object} [options={}]
 * @returns {{ id: string, baseVersion: string, version: string, hash: string, text: string }}
 */
export function getRagPromptDetails(promptType, options = {}) {
  const resolved = getRagPrompt(promptType, options);
  const hash = hashPrompt(resolved.text) || 'unhashed';
  return {
    id: resolved.id,
    baseVersion: resolved.baseVersion,
    version: resolved.version,
    hash,
    text: resolved.text,
  };
}
