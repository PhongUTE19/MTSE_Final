import { executeRAG } from '../knowledgeBase/ragService.js';
import { generateAnswer, generateAnswerStream } from '../../shared/integrations/ai/providers/geminiProvider.js';
import { runExpenseAssistantForUser } from '../expenseAgent/expenseAgent.service.js';
import { SERVER_MESSAGES, HTTP_STATUS } from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getSystemPrompt } from '../systemPrompt/systemPrompt.service.js';
import { config } from '../../config.js';
import {
  validateChatResponse,
  sanitizeGeneratedOutput,
  formatSafeErrorMessage,
} from '../../shared/guardrails/index.js';

export class AssistantServiceError extends AppError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

// Keep ChatServiceError alias for backwards compatibility
export const ChatServiceError = AssistantServiceError;

/**
 * Central Chat/Assistant Orchestrator coordinating all chatbot requests across strategies.
 *
 * Strategy selection:
 * - 'agent': Multimodal AI agent with tool calling and transaction proposals (default).
 * - 'rag': Knowledge Base retrieval-augmented generation.
 *
 * For the current version, 'agent' is active by default and RAG invocation is disabled.
 * RAG remains fully implemented, tested, and recoverable via backend configuration (`CHAT_STRATEGY=rag`).
 */

export async function orchestrateChat(rawMessage, options = {}) {
  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new AssistantServiceError(SERVER_MESSAGES.ERRORS.QUERY_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  const query = rawMessage.trim();
  const configuredStrategy = (process.env.CHAT_STRATEGY || config.chatStrategy || 'agent').toLowerCase();
  const strategy = options.strategy || (
    options.ragExecutor || options.llmGenerator ? 'rag' : configuredStrategy
  );

  if (strategy === 'rag') {
    return orchestrateRAGChat(query, options);
  }

  return orchestrateAgentChat(query, options);
}

export async function orchestrateAgentChat(query, options = {}) {
  const user = options.user;
  const runner = options.agentRunner || runExpenseAssistantForUser;
  const rawResult = await runner(user, query, options);

  // Normalized central response contract across all workflows
  return {
    answer: rawResult.answer,
    strategy: 'agent',
    toolName: rawResult.toolName || null,
    toolResult: rawResult.toolResult || null,
    proposal: rawResult.toolResult?.proposal || null,
    sources: [],
    retrieval: null,
  };
}

export async function orchestrateRAGChat(query, options = {}) {
  const ragExecutor = options.ragExecutor || executeRAG;
  const llmGenerator = options.llmGenerator || generateAnswer;

  const systemPrompt = options.systemPrompt || getSystemPrompt();
  const ragResult = await ragExecutor(query, { ...options, systemPrompt });

  // If evidence is insufficient, request is out-of-scope, or prompt injection refused
  if (!ragResult.passedThreshold) {
    return {
      answer: ragResult.refusalText,
      strategy: 'rag',
      toolName: null,
      toolResult: null,
      proposal: null,
      sources: [],
      retrieval: ragResult.retrieval,
    };
  }

  try {
    const rawAnswer = await llmGenerator(ragResult.prompt, {
      ...options,
      promptId: ragResult.promptId || null,
      promptVersion: ragResult.promptVersion || null,
    });

    // Guardrail: Validate AI response non-emptiness and prevent prompt leakage
    const validated = validateChatResponse(rawAnswer);

    return {
      answer: validated.answer,
      strategy: 'rag',
      toolName: null,
      toolResult: null,
      proposal: null,
      sources: ragResult.sources,
      retrieval: ragResult.retrieval,
      promptId: ragResult.promptId || null,
      promptVersion: ragResult.promptVersion || null,
      promptHash: ragResult.promptHash || null,
    };
  } catch (error) {
    if (error instanceof AssistantServiceError) {
      throw error;
    }
    console.error('[AssistantOrchestrator] Error during LLM generation:', error.message);
    const safeMessage = formatSafeErrorMessage(error);
    throw new AssistantServiceError(
      safeMessage,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Streaming assistant orchestration.
 *
 * @param {string} rawMessage - Raw user query
 * @param {(type: string, data: any) => void} emit - Callback relaying events ('metadata', 'delta', 'done', 'error')
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal for request cancellation
 */
export async function orchestrateChatStream(rawMessage, emit, options = {}) {
  const signal = options.signal;

  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new AssistantServiceError(SERVER_MESSAGES.ERRORS.QUERY_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  const query = rawMessage.trim();
  const configuredStrategy = (process.env.CHAT_STRATEGY || config.chatStrategy || 'agent').toLowerCase();
  const strategy = options.strategy || (
    options.ragExecutor || options.llmStreamGenerator ? 'rag' : configuredStrategy
  );

  if (strategy === 'rag') {
    return orchestrateRAGChatStream(query, emit, options);
  }

  return orchestrateAgentChatStream(query, emit, options);
}

export async function orchestrateAgentChatStream(query, emit, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return;

  const result = await orchestrateAgentChat(query, options);

  if (signal?.aborted) return;

  emit('metadata', {
    strategy: 'agent',
    toolName: result.toolName,
    toolResult: result.toolResult,
    proposal: result.proposal,
    sources: [],
    retrieval: null,
  });

  emit('delta', { text: result.answer });

  emit('done', {
    answer: result.answer,
    strategy: 'agent',
    toolName: result.toolName,
    toolResult: result.toolResult,
    proposal: result.proposal,
    sources: [],
    retrieval: null,
  });
}

export async function orchestrateRAGChatStream(query, emit, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return;

  const ragExecutor = options.ragExecutor || executeRAG;
  const llmStreamGenerator = options.llmStreamGenerator || generateAnswerStream;

  const systemPrompt = options.systemPrompt || getSystemPrompt();
  const ragResult = await ragExecutor(query, { ...options, systemPrompt });

  if (signal?.aborted) return;

  // Case 1: Refusal (prompt injection, out-of-scope, retrieval failure, or insufficient similarity)
  if (!ragResult.passedThreshold) {
    emit('metadata', { strategy: 'rag', sources: [], retrieval: ragResult.retrieval });
    emit('delta', { text: ragResult.refusalText });
    emit('done', { strategy: 'rag', sources: [], retrieval: ragResult.retrieval });
    return;
  }

  // Case 2: Grounded stream generation
  emit('metadata', { strategy: 'rag', sources: ragResult.sources, retrieval: ragResult.retrieval });

  let streamedAnyText = false;
  let emittedTerminal = false;

  try {
    const stream = await llmStreamGenerator(ragResult.prompt, {
      ...options,
      signal,
      promptId: ragResult.promptId || null,
      promptVersion: ragResult.promptVersion || null,
    });

    for await (const chunk of stream) {
      if (signal?.aborted) {
        console.log('[AssistantOrchestrator] Generation aborted by signal.');
        break;
      }
      const text = chunk?.text;
      if (text) {
        // Sanitize chunk for tag leaks or prompt leakage
        const { isLeaking, sanitizedText } = sanitizeGeneratedOutput(text);
        if (!isLeaking && sanitizedText) {
          streamedAnyText = true;
          emit('delta', { text: sanitizedText });
        }
      }
    }

    if (!signal?.aborted) {
      if (!streamedAnyText) {
        emit('delta', { text: SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY });
      }
      emittedTerminal = true;
      emit('done', { strategy: 'rag', sources: ragResult.sources, retrieval: ragResult.retrieval });
    }
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') {
      console.log('[AssistantOrchestrator] Generation aborted by client.');
      return;
    }
    console.error('[AssistantOrchestrator] Error during LLM streaming:', error.message);
    if (!emittedTerminal) {
      emittedTerminal = true;
      const safeError = formatSafeErrorMessage(error);
      emit('error', { error: safeError });
    }
  }
}
