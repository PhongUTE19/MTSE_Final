import { config } from '../../config.js';
import { retrieveRelevantChunks } from './retriever.js';
import { buildGroundedPrompt, buildGroundedPromptDetails, formatContextSections } from './promptBuilder.js';
import { SERVER_MESSAGES } from '../../constants/index.js';
import { detectPromptInjection, classifyScope } from '../../shared/guardrails/index.js';

/**
 * Core RAG execution service.
 * 
 * Encapsulates:
 * 1. Prompt injection guardrail check
 * 2. Out-of-scope query classification
 * 3. Vector candidate retrieval
 * 4. Relevance score ranking & diagnostic mapping
 * 5. Similarity threshold guardrail evaluation
 * 6. Context assembly and grounded prompt generation
 * 7. Evidence sufficiency determination
 * 
 * @param {string} query - Cleaned user question
 * @param {object} [options]
 * @param {number} [options.topK] - Number of candidate chunks to retrieve
 * @param {number} [options.similarityThreshold] - Minimum cosine similarity required
 * @param {string} [options.systemPrompt] - Optional system prompt override
 * @param {(query: string, topK: number) => Promise<Array<object>>} [options.retrieverFn] - Optional retrieval function injection
 * @returns {Promise<object>} Structured RAG execution result
 */
export async function executeRAG(query, options = {}) {
  const topK = options.topK ?? config.topK;
  const similarityThreshold = options.similarityThreshold ?? config.similarityThreshold;
  const systemPrompt = options.systemPrompt;
  const retrieverFn = options.retrieverFn || retrieveRelevantChunks;

  // Guardrail 1: Adversarial Prompt Injection detection
  const injection = detectPromptInjection(query);
  if (injection.isInjection) {
    console.warn(`[RAGService] Prompt injection blocked: ${injection.reason}`);
    return {
      status: 'INJECTION_REFUSED',
      passedThreshold: false,
      refusalText: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL,
      sources: [],
      context: '',
      prompt: '',
      retrievedChunks: [],
      usedChunks: [],
      retrieval: {
        similarityThreshold,
        bestScore: 0,
        retrievedChunks: [],
        usedChunks: [],
        guardrail: 'prompt_injection',
      },
    };
  }

  // Guardrail 2: Out-of-Scope request classification
  const scope = classifyScope(query);
  if (scope.isOutOfScope) {
    console.log(`[RAGService] Out-of-scope request declined: category=${scope.category}`);
    return {
      status: 'OUT_OF_SCOPE',
      passedThreshold: false,
      refusalText: scope.refusalText || SERVER_MESSAGES.ERRORS.OUT_OF_SCOPE,
      sources: [],
      context: '',
      prompt: '',
      retrievedChunks: [],
      usedChunks: [],
      retrieval: {
        similarityThreshold,
        bestScore: 0,
        retrievedChunks: [],
        usedChunks: [],
        guardrail: 'out_of_scope',
      },
    };
  }

  let retrievedChunks = [];
  let retrievalError = null;

  try {
    retrievedChunks = await retrieverFn(query, topK);
  } catch (err) {
    console.error('[RAGService] Error during chunk retrieval:', err.message);
    retrievalError = err.message;
  }

  // Case 1: Retrieval failure (Vector DB unreachable or error)
  if (retrievalError) {
    const retrievalMetadata = {
      error: retrievalError,
      retrievedChunks: [],
      usedChunks: [],
      similarityThreshold,
      bestScore: 0,
    };

    return {
      status: 'RETRIEVAL_ERROR',
      passedThreshold: false,
      error: retrievalError,
      refusalText: SERVER_MESSAGES.ERRORS.RETRIEVAL_FAILED,
      sources: [],
      context: '',
      prompt: '',
      retrievedChunks: [],
      usedChunks: [],
      retrieval: retrievalMetadata,
    };
  }

  const bestScore = retrievedChunks[0]?.score || 0;
  const passedThreshold = bestScore >= similarityThreshold;

  // Map all candidate chunks with diagnostic properties
  const diagnosticChunks = retrievedChunks.map((chunk, index) => ({
    rank: index + 1,
    id: chunk.id,
    title: chunk.title,
    sectionNumber: chunk.sectionNumber,
    sectionTitle: chunk.sectionTitle,
    source: chunk.source,
    score: chunk.score,
    content: chunk.content,
    passedToLLM: passedThreshold,
  }));

  // Case 2: Insufficient evidence (query rejected by similarity threshold guardrail)
  if (!passedThreshold) {
    console.log(
      `[RAGService] Query rejected by similarity threshold (${bestScore} < ${similarityThreshold}).`
    );

    const retrievalMetadata = {
      similarityThreshold,
      bestScore,
      retrievedChunks: diagnosticChunks,
      usedChunks: [],
    };

    return {
      status: 'INSUFFICIENT',
      passedThreshold: false,
      refusalText: SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION,
      sources: [],
      context: '',
      prompt: '',
      retrievedChunks: diagnosticChunks,
      usedChunks: [],
      retrieval: retrievalMetadata,
    };
  }

  // Case 3: Sufficient evidence to answer the query
  console.log(
    `[RAGService] Query accepted (${bestScore} >= ${similarityThreshold}). Context assembled.`
  );

  const sources = retrievedChunks.map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    sectionNumber: chunk.sectionNumber,
    sectionTitle: chunk.sectionTitle,
    source: chunk.source,
    score: chunk.score,
  }));

  const retrievalMetadata = {
    similarityThreshold,
    bestScore,
    retrievedChunks: diagnosticChunks,
    usedChunks: diagnosticChunks,
  };

  const context = formatContextSections(retrievedChunks);
  const promptDetails = buildGroundedPromptDetails(query, retrievedChunks, systemPrompt, options);

  return {
    status: 'SUFFICIENT',
    passedThreshold: true,
    sources,
    context,
    prompt: promptDetails.text,
    promptId: promptDetails.id,
    promptVersion: promptDetails.baseVersion,
    promptHash: promptDetails.hash,
    retrievedChunks: diagnosticChunks,
    usedChunks: diagnosticChunks,
    retrieval: retrievalMetadata,
  };
}
