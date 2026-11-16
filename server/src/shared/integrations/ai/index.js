import { config } from '../../../config.js';
import { geminiProvider } from './providers/geminiProvider.js';
import { AI_CAPABILITIES, assertCapability, hasCapability } from './contracts.js';

/**
 * Registry of available AI provider implementations.
 */
const providers = new Map([
  ['gemini', geminiProvider],
]);

/**
 * Registers a new or custom AI provider implementation.
 * Allows adding providers at runtime or via plugins without modifying core business logic.
 *
 * @param {string} name - Provider identifier key
 * @param {object} providerInstance - Object implementing AI provider methods
 */
export function registerAIProvider(name, providerInstance) {
  if (!name || typeof name !== 'string') {
    throw new Error('AI provider name must be a non-empty string.');
  }
  if (!providerInstance || typeof providerInstance !== 'object') {
    throw new Error(`Invalid AI provider instance for "${name}".`);
  }
  providers.set(name.toLowerCase().trim(), providerInstance);
}

/**
 * Retrieves the resolved AI provider instance based on runtime config or explicit override.
 *
 * @param {string} [providerName] - Optional provider name override
 * @returns {object} The resolved provider implementation
 */
export function getAIProvider(providerName) {
  const target = (providerName || config.aiProvider || 'gemini').toLowerCase().trim();
  const provider = providers.get(target);

  if (!provider) {
    const available = Array.from(providers.keys()).join(', ');
    throw new Error(
      `Unsupported AI provider: "${target}". Configured provider is unavailable. Available providers: [${available}]`
    );
  }

  return provider;
}

/**
 * Generates an embedding vector for the provided text using the active AI provider.
 *
 * @param {string} text - Text to embed
 * @param {object} [options]
 * @param {string} [options.provider] - Optional provider override
 * @param {string} [options.feature] - Feature context for analytics
 * @param {string} [options.model] - Specific embedding model override
 * @returns {Promise<number[]>}
 */
export async function embedText(text, options = {}) {
  const provider = getAIProvider(options.provider || config.embeddingProvider);
  assertCapability(provider, AI_CAPABILITIES.EMBEDDINGS);
  if (typeof provider.embedText !== 'function') {
    throw new Error(`AI provider "${provider.name || config.embeddingProvider}" does not support embedText.`);
  }
  return provider.embedText(text, options);
}

/**
 * Calls text generation using the active AI provider.
 *
 * @param {string} prompt - Prompt or question
 * @param {object} [options]
 * @param {string} [options.provider] - Optional provider override
 * @param {string} [options.feature] - Feature context for analytics
 * @param {string} [options.model] - Specific model override
 * @returns {Promise<string>} Generated text response
 */
export async function generateAnswer(prompt, options = {}) {
  const provider = getAIProvider(options.provider);
  if (typeof provider.generateAnswer !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support generateAnswer.`);
  }
  return provider.generateAnswer(prompt, options);
}

/**
 * Calls streaming text generation using the active AI provider.
 *
 * @param {string} prompt - Prompt or question
 * @param {object} [options]
 * @param {string} [options.provider] - Optional provider override
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 * @param {string} [options.feature] - Feature context for analytics
 * @param {string} [options.model] - Specific model override
 * @returns {Promise<AsyncIterable<any>>} Async iterable yielding streaming chunks
 */
export async function generateAnswerStream(prompt, options = {}) {
  const provider = getAIProvider(options.provider);
  if (typeof provider.generateAnswerStream !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support generateAnswerStream.`);
  }
  return provider.generateAnswerStream(prompt, options);
}

export async function extractReceiptImage(image, options = {}) {
  const provider = getAIProvider(options.provider);
  assertCapability(provider, AI_CAPABILITIES.MULTIMODAL);
  if (typeof provider.extractReceiptImage !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support receipt extraction.`);
  }
  return provider.extractReceiptImage(image, options);
}

export async function generateToolTurn(params, options = {}) {
  const provider = getAIProvider(options.provider);
  assertCapability(provider, AI_CAPABILITIES.TOOL_CALLING);
  if (typeof provider.generateToolTurn !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support tool calling.`);
  }
  return provider.generateToolTurn(params);
}

export async function generateToolTurnStream(params, options = {}) {
  const provider = getAIProvider(options.provider);
  assertCapability(provider, AI_CAPABILITIES.STREAMING);
  assertCapability(provider, AI_CAPABILITIES.TOOL_CALLING);
  if (typeof provider.generateToolTurnStream !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support streaming tool turns.`);
  }
  return provider.generateToolTurnStream(params);
}

export async function generateToolFollowup(params, options = {}) {
  const provider = getAIProvider(options.provider);
  assertCapability(provider, AI_CAPABILITIES.TOOL_CALLING);
  if (typeof provider.generateToolFollowup !== 'function') {
    throw new Error(`AI provider "${provider.name || config.aiProvider}" does not support tool calling.`);
  }
  return provider.generateToolFollowup(params);
}

export { AI_CAPABILITIES, assertCapability, hasCapability };
export { geminiProvider };
export {
  getAIClient,
  getAIClient as getGeminiClient,
  setAIClientForTests,
  executeWithRetry,
} from './providers/geminiProvider.js';
export { validateStructuredOutput } from '../../guardrails/index.js';
