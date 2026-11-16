import crypto from 'node:crypto';
import { config } from '../../config.js';
import { HTTP_STATUS, SERVER_MESSAGES } from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';
import { formatSafeErrorMessage } from '../../shared/guardrails/index.js';
import { generateToolTurn, generateToolTurnStream } from '../../shared/integrations/ai/index.js';
import { recordProviderUsage } from '../../shared/integrations/ai/telemetry.js';
import {
  ASSISTANT_LIMITS,
  canExecuteTool,
  evaluateRequestPolicy,
  TOOL_NAMES,
} from './assistantPolicy.js';
import { buildUnifiedSystemInstruction, buildUnifiedUserPrompt } from './assistantPrompt.js';
import { executeRegisteredTool, getAllowedToolDeclarations } from './assistantTools.js';
import { createStreamingTextFilter, finalizeAssistantResponse } from './assistantResponse.js';
import {
  checkpointStreamAttempt,
  finalizeStreamAttempt,
  loadServerAuthoritativeHistory,
  registerStreamAttempt,
} from './assistantPersistence.js';

function createTurnState() {
  return {
    totalCalls: 0,
    kbCalls: 0,
    proposalCalls: 0,
    kbStatus: null,
    sourcesMap: new Map(),
    consultedSources: [],
    toolsExecuted: [],
    lastPrimaryTool: null,
    proposal: null,
    retrieval: null,
  };
}

function buildModelTurnContent(calls, rawAssistantContent) {
  return (
    rawAssistantContent || {
      role: 'model',
      parts: calls.map((call) => ({
        functionCall: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          args: call.args || {},
        },
      })),
    }
  );
}

/**
 * Executes a round's function calls sequentially under policy and budget gates,
 * returning `{ aborted, responseParts }` so sync and stream orchestrators share
 * identical tool-execution, error-handling, and state-accounting rules.
 */
async function executeToolCallsRound({
  calls,
  policy,
  state,
  user,
  options,
  signal,
  onProposal,
}) {
  const responseParts = [];

  for (const call of calls) {
    if (signal?.aborted) {
      return { aborted: true, responseParts };
    }

    const gate = canExecuteTool({ policy, toolName: call.name, state });
    let toolOutput;
    if (!gate.allowed) {
      toolOutput = { error: gate.reason };
    } else {
      state.totalCalls += 1;
      if (call.name === TOOL_NAMES.SEARCH_KNOWLEDGE_BASE) state.kbCalls += 1;
      if (call.name === TOOL_NAMES.PROPOSE_TRANSACTION) state.proposalCalls += 1;

      try {
        toolOutput = await executeRegisteredTool({
          toolName: call.name,
          rawArgs: call.args || {},
          user,
          state,
          options,
        });
        state.toolsExecuted.push(call.name);
        if (call.name !== TOOL_NAMES.SEARCH_KNOWLEDGE_BASE) {
          state.lastPrimaryTool = { name: call.name, result: toolOutput };
        }
        if (call.name === TOOL_NAMES.PROPOSE_TRANSACTION) {
          state.proposal = toolOutput.proposal || null;
          if (toolOutput?.proposal && typeof onProposal === 'function') {
            onProposal(toolOutput);
          }
        }
      } catch (toolError) {
        if (toolError instanceof AppError && toolError.statusCode === (HTTP_STATUS.GATEWAY_TIMEOUT || 504)) {
          throw toolError;
        }
        toolOutput = { error: toolError.message || 'Tool execution failed.' };
      }
    }

    responseParts.push({
      functionResponse: {
        ...(call.id ? { id: call.id } : {}),
        name: call.name,
        response: toolOutput,
      },
    });
  }

  return { aborted: false, responseParts };
}

function createUsageAccumulator() {
  return {
    hasAnyInput: false,
    hasAnyOutput: false,
    hasAnyTotal: false,
    hasAnyCached: false,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    provider: 'google-genai',
    model: config.geminiModel,
    isRefusal: false,
    refusalReason: null,
  };
}

function accumulateTurnUsage(acc, turn) {
  if (!turn) return;
  if (turn.provider) acc.provider = turn.provider;
  if (turn.model) acc.model = turn.model;
  if (turn.isRefusal) {
    acc.isRefusal = true;
    acc.refusalReason = turn.finishReason || acc.refusalReason;
  }
  const u = turn.tokenUsage;
  if (!u) return;
  if (typeof u.inputTokens === 'number') {
    acc.hasAnyInput = true;
    acc.inputTokens += u.inputTokens;
  }
  if (typeof u.outputTokens === 'number') {
    acc.hasAnyOutput = true;
    acc.outputTokens += u.outputTokens;
  }
  if (typeof u.totalTokens === 'number') {
    acc.hasAnyTotal = true;
    acc.totalTokens += u.totalTokens;
  }
  if (typeof u.cachedTokens === 'number') {
    acc.hasAnyCached = true;
    acc.cachedTokens += u.cachedTokens;
  }
}

function finalizeUsageSnapshot(acc) {
  const inputTokens = acc.hasAnyInput ? acc.inputTokens : null;
  const outputTokens = acc.hasAnyOutput ? acc.outputTokens : null;
  const cachedTokens = acc.hasAnyCached ? acc.cachedTokens : null;
  const rawTotal = acc.hasAnyTotal ? acc.totalTokens : null;
  const totalTokens = rawTotal !== null
    ? rawTotal
    : (acc.hasAnyInput && acc.hasAnyOutput ? inputTokens + outputTokens : null);
  const usageSource = (acc.hasAnyInput && acc.hasAnyOutput && rawTotal !== null)
    ? 'provider_reported'
    : (acc.hasAnyInput && acc.hasAnyOutput ? 'derived' : (rawTotal !== null ? 'provider_reported' : 'unavailable'));

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    usageSource,
    tokenCountsAvailable: acc.hasAnyInput || acc.hasAnyOutput || acc.hasAnyTotal,
  };
}

/**
 * Unified AI Assistant Orchestrator (P2-T12).
 * Coordinates deterministic scope/capability policy, sanitized user-only history,
 * bounded sequential Gemini tool calling, KB evidence gating, and citation validation.
 */
export async function orchestrateUnifiedChat(user, rawMessage, options = {}) {
  if (!user?.id || !user?.token) {
    throw new AppError(
      SERVER_MESSAGES.AUTH?.AUTH_REQUIRED || 'Authentication required.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }
  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new AppError(SERVER_MESSAGES.ERRORS.QUERY_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  const message = rawMessage.trim();
  const hasTrustedHistory = options.trustedHistory !== undefined && options.trustedHistory !== null;
  const shouldLoadAuthoritativeHistory =
    !hasTrustedHistory &&
    Boolean(options.conversationId) &&
    Boolean(
      options.useAuthoritativeHistory ||
      options.enablePersistence ||
      options.findOwnedConversation ||
      options.listConversationMessages
    );

  const trustedHistory = hasTrustedHistory
    ? options.trustedHistory
    : (shouldLoadAuthoritativeHistory
        ? await loadServerAuthoritativeHistory(user, options.conversationId, options)
        : null);

  const policy = evaluateRequestPolicy(
    trustedHistory !== null
      ? { message, trustedHistory }
      : { message, history: options.history }
  );

  if (!policy.allowed) {
    if (policy.statusCode === 400) {
      throw new AppError(policy.refusalText || 'Invalid request.', HTTP_STATUS.BAD_REQUEST);
    }
    return {
      answer: policy.refusalText,
      strategy: 'unified',
      scopeState: policy.scopeState,
      capability: policy.capability,
      toolName: null,
      toolResult: null,
      proposal: null,
      toolsExecuted: [],
      consultedSources: [],
      sources: [],
      retrieval: null,
      promptId: null,
      promptVersion: null,
      promptHash: null,
    };
  }

  const promptMeta = buildUnifiedSystemInstruction({
    today: options.today,
    customInstruction: options.systemInstruction,
  });
  const userPrompt = buildUnifiedUserPrompt(message, policy.sanitizedHistory);
  const declarations = getAllowedToolDeclarations(policy.allowedTools);

  const maxRounds = options.maxRounds ?? ASSISTANT_LIMITS.MAX_ROUNDS;
  const requestDeadlineMs = options.requestDeadlineMs ?? ASSISTANT_LIMITS.REQUEST_DEADLINE_MS;
  const startedAt = Date.now();

  const state = createTurnState();

  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
  const toolTurnRunner = options.toolTurnRunner || generateToolTurn;
  const usageAcc = createUsageAccumulator();
  let forcedKbReminderSent = false;
  let usageRecorded = false;
  const recordOnce = (outcome, error = null) => {
    if (usageRecorded) return;
    usageRecorded = true;
    try {
      (options.usageRecorder || recordProviderUsage)({
        feature: 'unified_assistant',
        operation: 'orchestrateUnifiedChat',
        provider: usageAcc.provider,
        model: usageAcc.model,
        outcome: usageAcc.isRefusal && outcome === 'success' ? 'refusal' : outcome,
        isRefusal: usageAcc.isRefusal,
        refusalReason: usageAcc.refusalReason,
        durationMs: Date.now() - startedAt,
        promptId: promptMeta.promptId,
        promptVersion: promptMeta.promptVersion,
        promptHash: promptMeta.promptHash,
        toolsExecuted: state.toolsExecuted,
        error,
        tokenUsage: finalizeUsageSnapshot(usageAcc),
      });
    } catch (telemetryErr) {
      console.error('[UnifiedOrchestrator] Telemetry recording failed (non-fatal):', telemetryErr.message);
    }
  };

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = requestDeadlineMs - elapsedMs;
      if (remainingMs <= 0) {
        throw new AppError('Assistant request deadline exceeded.', HTTP_STATUS.GATEWAY_TIMEOUT || 504);
      }

      const turn = await toolTurnRunner(
        {
          prompt: contents,
          systemInstruction: promptMeta.text,
          tools: declarations,
          model: options.model || config.geminiModel,
          timeoutMs: Math.min(options.timeoutMs ?? ASSISTANT_LIMITS.TOOL_TIMEOUT_MS, remainingMs),
          ai: options.ai,
        },
        { provider: options.provider }
      );
      accumulateTurnUsage(usageAcc, turn);

      const calls = Array.isArray(turn?.functionCalls) && turn.functionCalls.length > 0
        ? turn.functionCalls
        : (turn?.toolCall ? [turn.toolCall] : []);

      if (calls.length === 0) {
        if (
          policy.requiresKbEvidence &&
          state.kbStatus === null &&
          policy.allowedTools.includes(TOOL_NAMES.SEARCH_KNOWLEDGE_BASE) &&
          !forcedKbReminderSent &&
          round < maxRounds
        ) {
          forcedKbReminderSent = true;
          contents.push({
            role: 'user',
            parts: [{ text: 'Policy check required: call search_knowledge_base before answering.' }],
          });
          continue;
        }

        if (policy.requiresKbEvidence && state.kbStatus === null) {
          const out = finalizeAssistantResponse({
            rawAnswer: SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION || 'I could not verify that in the SpendWise documentation.',
            policy,
            state,
            promptMeta,
          });
          recordOnce('success');
          return out;
        }

        const out = finalizeAssistantResponse({
          rawAnswer: turn?.text || '',
          policy,
          state,
          promptMeta,
        });
        recordOnce('success');
        return out;
      }

      contents.push(buildModelTurnContent(calls, turn.rawAssistantContent));

      const { responseParts } = await executeToolCallsRound({
        calls,
        policy,
        state,
        user,
        options,
      });

      contents.push({ role: 'user', parts: responseParts });
    }

    throw new AppError('Assistant exceeded maximum orchestration rounds.', HTTP_STATUS.BAD_REQUEST);
  } catch (err) {
    recordOnce('failure', err);
    throw err;
  }
}

const STREAM_CHECKPOINT_CHARS = 400;

/**
 * Validates and preloads server-authoritative history (if persistence is enabled)
 * before SSE response headers are committed.
 */
export async function prepareUnifiedChatStream(user, rawMessage, options = {}) {
  if (!user?.id || !user?.token) {
    throw new AppError(
      SERVER_MESSAGES.AUTH?.AUTH_REQUIRED || 'Authentication required.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }
  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new AppError(SERVER_MESSAGES.ERRORS.QUERY_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  const message = rawMessage.trim();
  const usePersistence = options.enablePersistence ?? Boolean(options.beginStreamTurn || options.persistence);
  const hasPreloadedTrusted = options.trustedHistory !== undefined && options.trustedHistory !== null;

  let trustedHistory = hasPreloadedTrusted ? options.trustedHistory : null;
  if (!hasPreloadedTrusted && usePersistence) {
    trustedHistory = await loadServerAuthoritativeHistory(user, options.conversationId, options);
  }

  const policy = evaluateRequestPolicy(
    trustedHistory !== null
      ? { message, trustedHistory }
      : { message, history: options.history }
  );

  if (!policy.allowed && policy.statusCode === 400) {
    throw new AppError(policy.refusalText || 'Invalid request.', HTTP_STATUS.BAD_REQUEST);
  }

  return { trustedHistory, policy };
}

/**
 * Genuine End-to-End Streaming Unified Assistant Orchestrator (P2-T13).
 * Streams incremental tokens from Gemini, executes tools sequentially,
 * enforces server-authoritative history & conditional DB persistence, and handles aborts.
 */
export async function orchestrateUnifiedChatStream(user, rawMessage, emit, options = {}) {
  if (!user?.id || !user?.token) {
    throw new AppError(
      SERVER_MESSAGES.AUTH?.AUTH_REQUIRED || 'Authentication required.',
      HTTP_STATUS.UNAUTHORIZED
    );
  }
  if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new AppError(SERVER_MESSAGES.ERRORS.QUERY_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  const signal = options.signal;
  if (signal?.aborted) return;

  const message = rawMessage.trim();
  const requestId = options.requestId || crypto.randomUUID();
  const conversationId = options.conversationId || crypto.randomUUID();
  const userMessageId = options.userMessageId || crypto.randomUUID();
  const assistantMessageId = options.assistantMessageId || crypto.randomUUID();
  const usePersistence = options.enablePersistence ?? Boolean(options.beginStreamTurn || options.persistence);
  const hasPreloadedTrusted = options.trustedHistory !== undefined && options.trustedHistory !== null;

  let trustedHistory = hasPreloadedTrusted ? options.trustedHistory : null;
  if (!hasPreloadedTrusted && usePersistence) {
    trustedHistory = await loadServerAuthoritativeHistory(user, conversationId, options);
  }

  const policy = evaluateRequestPolicy(
    trustedHistory !== null
      ? { message, trustedHistory }
      : { message, history: options.history }
  );

  if (!policy.allowed && policy.statusCode === 400) {
    throw new AppError(policy.refusalText || 'Invalid request.', HTTP_STATUS.BAD_REQUEST);
  }

  if (usePersistence) {
    const registered = await registerStreamAttempt(
      user,
      {
        conversationId,
        title: message.slice(0, 48),
        userMessageId,
        userContent: message,
        assistantMessageId,
        requestId,
      },
      options
    );
    if (registered?.is_duplicate) {
      throw new AppError('Duplicate streaming request.', HTTP_STATUS.CONFLICT || 409);
    }
  }

  emit('meta', {
    requestId,
    conversationId,
    userMessageId,
    assistantMessageId,
    scopeState: policy.scopeState,
    capability: policy.capability,
    status: 'streaming',
  });

  if (!policy.allowed) {
    if (usePersistence) {
      await finalizeStreamAttempt(
        user,
        {
          messageId: assistantMessageId,
          requestId,
          status: 'completed',
          content: policy.refusalText,
        },
        options
      );
    }
    emit('delta', { text: policy.refusalText });
    emit('done', {
      requestId,
      conversationId,
      userMessageId,
      assistantMessageId,
      status: 'completed',
      answer: policy.refusalText,
      strategy: 'unified',
      scopeState: policy.scopeState,
      capability: policy.capability,
      toolName: null,
      toolResult: null,
      proposal: null,
      toolsExecuted: [],
      consultedSources: [],
      sources: [],
      retrieval: null,
    });
    return;
  }

  const promptMeta = buildUnifiedSystemInstruction({
    today: options.today,
    customInstruction: options.systemInstruction,
  });
  const userPrompt = buildUnifiedUserPrompt(message, policy.sanitizedHistory);
  const declarations = getAllowedToolDeclarations(policy.allowedTools);

  const maxRounds = options.maxRounds ?? ASSISTANT_LIMITS.MAX_ROUNDS;
  const requestDeadlineMs = options.requestDeadlineMs ?? ASSISTANT_LIMITS.REQUEST_DEADLINE_MS;
  const startedAt = Date.now();

  const state = createTurnState();

  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
  const toolTurnStreamRunner = options.toolTurnStreamRunner || generateToolTurnStream;
  const usageAcc = createUsageAccumulator();
  let forcedKbReminderSent = false;
  let accumulatedText = '';
  let lastCheckpointLength = 0;
  let terminalEmitted = false;
  let timeToFirstTokenMs = null;
  let streamUsageRecorded = false;
  const safeEmit = (event, data) => {
    if (terminalEmitted || signal?.aborted) return;
    if (event === 'delta' && timeToFirstTokenMs === null) {
      timeToFirstTokenMs = Date.now() - startedAt;
    }
    if (event === 'done' || event === 'error') {
      terminalEmitted = true;
    }
    emit(event, data);
  };
  const recordStreamOnce = (outcome, error = null) => {
    if (streamUsageRecorded) return;
    streamUsageRecorded = true;
    try {
      (options.usageRecorder || recordProviderUsage)({
        feature: 'unified_assistant',
        operation: 'orchestrateUnifiedChatStream',
        provider: usageAcc.provider,
        model: usageAcc.model,
        outcome: usageAcc.isRefusal && outcome === 'success' ? 'refusal' : outcome,
        isRefusal: usageAcc.isRefusal,
        refusalReason: usageAcc.refusalReason,
        durationMs: Date.now() - startedAt,
        timeToFirstTokenMs,
        promptId: promptMeta.promptId,
        promptVersion: promptMeta.promptVersion,
        promptHash: promptMeta.promptHash,
        toolsExecuted: state.toolsExecuted,
        error,
        tokenUsage: finalizeUsageSnapshot(usageAcc),
      });
    } catch (telemetryErr) {
      console.error('[UnifiedOrchestrator] Stream telemetry recording failed (non-fatal):', telemetryErr.message);
    }
  };

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      if (signal?.aborted) {
        if (usePersistence) {
          await finalizeStreamAttempt(
            user,
            { messageId: assistantMessageId, requestId, status: 'aborted', content: accumulatedText },
            options
          );
        }
        recordStreamOnce('aborted');
        return;
      }

      const remainingMs = requestDeadlineMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        throw new AppError('Assistant request deadline exceeded.', HTTP_STATUS.GATEWAY_TIMEOUT || 504);
      }

      const stream = await toolTurnStreamRunner(
        {
          prompt: contents,
          systemInstruction: promptMeta.text,
          tools: declarations,
          model: options.model || config.geminiModel,
          timeoutMs: Math.min(options.timeoutMs ?? ASSISTANT_LIMITS.TOOL_TIMEOUT_MS, remainingMs),
          signal,
          ai: options.ai,
        },
        { provider: options.provider }
      );

      let turnComplete = null;
      let roundText = '';
      let emittedRoundDelta = false;
      const deltaFilter = createStreamingTextFilter({ sourcesMap: state.sourcesMap });

      for await (const chunk of stream) {
        if (signal?.aborted) {
          if (usePersistence) {
            await finalizeStreamAttempt(
              user,
              { messageId: assistantMessageId, requestId, status: 'aborted', content: accumulatedText },
              options
            );
          }
          recordStreamOnce('aborted');
          return;
        }
        if (chunk?.type === 'text' && typeof chunk.text === 'string' && chunk.text.length > 0) {
          roundText += chunk.text;
          accumulatedText += chunk.text;
          const safeDelta = deltaFilter.push(chunk.text);
          if (safeDelta) {
            emittedRoundDelta = true;
            safeEmit('delta', { text: safeDelta });
          }
          if (usePersistence && accumulatedText.length - lastCheckpointLength >= STREAM_CHECKPOINT_CHARS) {
            lastCheckpointLength = accumulatedText.length;
            await checkpointStreamAttempt(
              user,
              { messageId: assistantMessageId, requestId, content: accumulatedText },
              options
            );
          }
        } else if (chunk?.type === 'turn_complete') {
          turnComplete = chunk;
          accumulateTurnUsage(usageAcc, turnComplete);
        }
      }

      const calls = Array.isArray(turnComplete?.functionCalls) && turnComplete.functionCalls.length > 0
        ? turnComplete.functionCalls
        : (turnComplete?.toolCall ? [turnComplete.toolCall] : []);

      if (calls.length === 0) {
        if (
          policy.requiresKbEvidence &&
          state.kbStatus === null &&
          policy.allowedTools.includes(TOOL_NAMES.SEARCH_KNOWLEDGE_BASE) &&
          !forcedKbReminderSent &&
          round < maxRounds
        ) {
          forcedKbReminderSent = true;
          contents.push({
            role: 'user',
            parts: [{ text: 'Policy check required: call search_knowledge_base before answering.' }],
          });
          continue;
        }

        const trailingDelta = deltaFilter.flush();
        if (trailingDelta) {
          emittedRoundDelta = true;
          safeEmit('delta', { text: trailingDelta });
        }

        const rawFinal =
          policy.requiresKbEvidence && state.kbStatus === null
            ? (SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION || 'I could not verify that in the SpendWise documentation.')
            : (roundText || turnComplete?.text || '');

        const finalized = finalizeAssistantResponse({
          rawAnswer: rawFinal,
          policy,
          state,
          promptMeta,
        });

        if (!emittedRoundDelta && finalized.answer) {
          safeEmit('delta', { text: finalized.answer });
        }

        if (finalized.sources.length > 0 || finalized.consultedSources.length > 0) {
          safeEmit('sources', {
            sources: finalized.sources,
            consultedSources: finalized.consultedSources,
          });
        }

        if (usePersistence) {
          const saved = await finalizeStreamAttempt(
            user,
            {
              messageId: assistantMessageId,
              requestId,
              status: 'completed',
              content: finalized.answer,
              toolName: finalized.toolName,
              toolResult: finalized.toolResult,
              sources: finalized.sources,
            },
            options
          );
          if (!saved) {
            throw new AppError('Stream attempt could not be finalized.', HTTP_STATUS.CONFLICT || 409);
          }
        }

        recordStreamOnce('success');
        safeEmit('done', {
          requestId,
          conversationId,
          userMessageId,
          assistantMessageId,
          status: 'completed',
          ...finalized,
        });
        return;
      }

      contents.push(buildModelTurnContent(calls, turnComplete?.rawAssistantContent));

      const { aborted, responseParts } = await executeToolCallsRound({
        calls,
        policy,
        state,
        user,
        options: { ...options, conversationId },
        signal,
        onProposal: (toolOutput) => safeEmit('proposal', toolOutput),
      });

      if (aborted) {
        if (usePersistence) {
          await finalizeStreamAttempt(
            user,
            { messageId: assistantMessageId, requestId, status: 'aborted', content: accumulatedText },
            options
          );
        }
        recordStreamOnce('aborted');
        return;
      }

      contents.push({ role: 'user', parts: responseParts });
    }

    throw new AppError('Assistant exceeded maximum orchestration rounds.', HTTP_STATUS.BAD_REQUEST);
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      if (usePersistence) {
        await finalizeStreamAttempt(
          user,
          { messageId: assistantMessageId, requestId, status: 'aborted', content: accumulatedText },
          options
        ).catch(() => {});
      }
      recordStreamOnce('aborted', err);
      return;
    }

    const safeMessage = formatSafeErrorMessage(err);
    if (usePersistence) {
      await finalizeStreamAttempt(
        user,
        {
          messageId: assistantMessageId,
          requestId,
          status: 'failed',
          content: accumulatedText,
          errorMessage: safeMessage,
        },
        options
      ).catch(() => {});
    }

    recordStreamOnce('failure', err);
    safeEmit('error', {
      error: safeMessage,
      requestId,
      assistantMessageId,
      status: 'failed',
    });
  }
}
