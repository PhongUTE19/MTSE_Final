/**
 * Provider-agnostic AI capability identifiers and validation helpers.
 * Adapters declare supported capabilities explicitly so application services
 * do not assume every model/provider supports every feature.
 */

export const AI_CAPABILITIES = Object.freeze({
  TEXT_GENERATION: 'textGeneration',
  STREAMING: 'streaming',
  TOOL_CALLING: 'toolCalling',
  STRUCTURED_OUTPUT: 'structuredOutput',
  MULTIMODAL: 'multimodal',
  EMBEDDINGS: 'embeddings',
});

/**
 * Checks whether a provider adapter declares support for a given capability.
 *
 * @param {object} provider
 * @param {string} capability
 * @returns {boolean}
 */
export function hasCapability(provider, capability) {
  return Boolean(provider?.capabilities?.[capability]);
}

/**
 * Asserts that a provider adapter supports a required capability, failing fast
 * with an explicit error if not supported.
 *
 * @param {object} provider
 * @param {string} capability
 * @param {string} [providerName]
 */
export function assertCapability(provider, capability, providerName) {
  if (!hasCapability(provider, capability)) {
    const label = providerName || provider?.name || 'unknown';
    throw new Error(`AI provider "${label}" does not support capability "${capability}".`);
  }
}
