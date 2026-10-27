import { config } from '../../config.js';
import { getSystemPrompt } from '../systemPrompt/systemPrompt.service.js';
import { getRagPrompt, getRagPromptDetails } from './ragPrompt.js';

/**
 * Formats retrieved chunks into standardized context blocks with citation headers.
 * 
 * @param {Array<{title: string, content: string, source: string, id: string}>} chunks - Retrieved context chunks
 * @returns {string} Formatted context sections
 */
export function formatContextSections(chunks) {
  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return '';
  }

  return chunks
    .map(
      (chunk, index) => {
        const sanitizedContent = (chunk.content || '').replace(/<\/?(?:retrieved_context|student_question|user_question|context|system|prompt|instruction)>/gi, '');
        return `[Source ${index + 1}: Document: ${chunk.source} | Section: ${chunk.title} | Chunk ID: ${chunk.id}]\n${sanitizedContent}`;
      }
    )
    .join('\n\n');
}

/**
 * Builds the strict grounded prompt injecting the retrieved context sections.
 * Demarcates untrusted reference context and user input within XML tags to prevent
 * indirect or direct prompt injection attacks.
 * 
 * @param {string} question - User question
 * @param {Array<{title: string, content: string, source: string, id: string}>} chunks - Retrieved context chunks
 * @param {string} [customPrompt] - Optional override system prompt
 * @param {object} [options={}] - Optional version and override parameters
 * @returns {string} Formatted prompt string
 */
export function buildGroundedPrompt(question, chunks, customPrompt, options = {}) {
  const contextSections = formatContextSections(chunks);
  const systemPrompt = customPrompt || (typeof getSystemPrompt === 'function' ? getSystemPrompt() : (config.defaultSystemPrompt || ''));
  const sanitizedQuestion = (question || '').replace(/<\/?(?:retrieved_context|student_question|user_question|context|system|prompt|instruction)>/gi, '');

  const promptResult = getRagPrompt('grounded', {
    version: options.version,
    override: options.override,
    variables: {
      systemPrompt,
      context: contextSections,
      question: sanitizedQuestion,
    },
  });

  return promptResult.text;
}

/**
 * Returns full details (ID, explicit version, content hash, text) for the grounded prompt.
 *
 * @param {string} question - User question
 * @param {Array<{title: string, content: string, source: string, id: string}>} chunks - Retrieved context chunks
 * @param {string} [customPrompt] - Optional override system prompt
 * @param {object} [options={}] - Optional version and override parameters
 * @returns {{ id: string, baseVersion: string, version: string, hash: string, text: string }}
 */
export function buildGroundedPromptDetails(question, chunks, customPrompt, options = {}) {
  const contextSections = formatContextSections(chunks);
  const systemPrompt = customPrompt || (typeof getSystemPrompt === 'function' ? getSystemPrompt() : (config.defaultSystemPrompt || ''));
  const sanitizedQuestion = (question || '').replace(/<\/?(?:retrieved_context|student_question|user_question|context|system|prompt|instruction)>/gi, '');

  return getRagPromptDetails('grounded', {
    version: options.version,
    override: options.override,
    variables: {
      systemPrompt,
      context: contextSections,
      question: sanitizedQuestion,
    },
  });
}
