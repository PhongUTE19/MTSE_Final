import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { config } from '../../../../config.js';
import { ALL_CATEGORIES, SERVER_MESSAGES, RETRY_CONFIG, SERVER_CONFIG_DEFAULTS, GUARDRAIL_CONFIG } from '../../../../constants/index.js';
import { recordProviderUsage as recordUsage, hashPrompt } from '../telemetry.js';
import { validateChatResponse, withTimeout, validateStructuredOutput, AIResponseValidationError } from '../../../guardrails/index.js';

export function normalizeUsageMetadata(usageMetadata) {
  const usage = usageMetadata || {};
  const inputTokens = typeof usage.promptTokenCount === 'number' && Number.isFinite(usage.promptTokenCount)
    ? usage.promptTokenCount
    : null;
  const outputTokens = typeof usage.candidatesTokenCount === 'number' && Number.isFinite(usage.candidatesTokenCount)
    ? usage.candidatesTokenCount
    : null;
  const cachedTokens = typeof usage.cachedContentTokenCount === 'number' && Number.isFinite(usage.cachedContentTokenCount)
    ? usage.cachedContentTokenCount
    : null;
  const rawTotal = typeof usage.totalTokenCount === 'number' && Number.isFinite(usage.totalTokenCount)
    ? usage.totalTokenCount
    : null;

  const hasIn = inputTokens !== null;
  const hasOut = outputTokens !== null;
  const totalTokens = rawTotal !== null ? rawTotal : (hasIn && hasOut ? inputTokens + outputTokens : null);
  const usageSource = (hasIn && hasOut && rawTotal !== null)
    ? 'provider_reported'
    : (hasIn && hasOut ? 'derived' : (rawTotal !== null ? 'provider_reported' : 'unavailable'));

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    usageSource,
    tokenCountsAvailable: hasIn || hasOut || rawTotal !== null,
  };
}

let aiInstance = null;

/**
 * Returns a singleton instance of the Google GenAI client.
 */
export function getAIClient() {
  if (!config.geminiApiKey || config.geminiApiKey === SERVER_CONFIG_DEFAULTS.PLACEHOLDER_KEY) {
    throw new Error(SERVER_MESSAGES.ERRORS.GEMINI_API_KEY_NOT_CONFIGURED);
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiInstance;
}

/**
 * Sets or resets the singleton AI client instance for tests.
 * @param {object|null} client
 */
export function setAIClientForTests(client) {
  aiInstance = client;
}

/**
 * Executes an asynchronous provider operation with retry logic for transient errors,
 * capturing attempt timings and retry history for analytics.
 *
 * @template T
 * @param {() => Promise<T>} operation
 * @param {number} [maxRetries=RETRY_CONFIG.MAX_RETRIES]
 * @param {number} [initialDelayMs=RETRY_CONFIG.INITIAL_DELAY_MS]
 * @param {number} [timeoutMs=GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS]
 * @param {string} [customTimeoutMessage=SERVER_MESSAGES.ERRORS.AI_TIMEOUT]
 * @returns {Promise<{ result: T, attempts: Array<object>, totalAttempts: number, durationMs: number }>}
 */
export async function executeWithRetry(
  operation,
  maxRetries = RETRY_CONFIG.MAX_RETRIES,
  initialDelayMs = RETRY_CONFIG.INITIAL_DELAY_MS,
  timeoutMs = GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS,
  customTimeoutMessage = SERVER_MESSAGES.ERRORS.AI_TIMEOUT,
  signal = null
) {
  const attempts = [];
  const startOverall = Date.now();
  let attemptNumber = 0;

  while (true) {
    if (signal?.aborted) {
      const abortError = new Error('Operation aborted by client.');
      abortError.name = 'AbortError';
      abortError.executionMetadata = {
        attempts,
        totalAttempts: attempts.length,
        durationMs: Date.now() - startOverall,
      };
      throw abortError;
    }

    attemptNumber++;
    const startAttempt = Date.now();
    try {
      const opPromise = operation();
      const result = timeoutMs ? await withTimeout(opPromise, timeoutMs, customTimeoutMessage) : await opPromise;
      const attemptDuration = Date.now() - startAttempt;
      attempts.push({
        attemptNumber,
        durationMs: attemptDuration,
        status: 'success',
      });
      return {
        result,
        attempts,
        totalAttempts: attemptNumber,
        durationMs: Date.now() - startOverall,
      };
    } catch (error) {
      const attemptDuration = Date.now() - startAttempt;
      attempts.push({
        attemptNumber,
        durationMs: attemptDuration,
        status: 'failure',
        error: error.message,
      });

      const msg = String(error?.message || error || '').toLowerCase();
      const status = error?.status || error?.code || error?.statusCode;
      const isAbort = error?.name === 'AbortError' || Boolean(signal?.aborted);
      const isTimeout =
        !isAbort && (
          error?.name === 'AIResponseTimeoutError' ||
          msg.includes('timed out') ||
          msg.includes('timeout') ||
          status === 408 ||
          status === 504
        );
      const isTransient =
        !isAbort && (
          isTimeout ||
          status === 429 ||
          status === 503 ||
          msg.includes('503') ||
          msg.includes('unavailable') ||
          msg.includes('429') ||
          msg.includes('resource_exhausted') ||
          msg.includes('quota')
        );

      if (attemptNumber <= maxRetries && isTransient) {
        const delay = initialDelayMs * Math.pow(2, attemptNumber - 1);
        console.warn(`[Gemini] Transient API error: retrying attempt ${attemptNumber}/${maxRetries} after ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        error.executionMetadata = {
          attempts,
          totalAttempts: attemptNumber,
          durationMs: Date.now() - startOverall,
        };
        throw error;
      }
    }
  }
}

/**
 * Generates an embedding vector for the provided text using Gemini embedding model.
 *
 * @param {string} text - Text to embed
 * @param {object} [options]
 * @param {string} [options.feature='knowledge']
 * @returns {Promise<number[]>} Array of floating-point numbers
 */
export async function embedText(text, options = {}) {
  const ai = getAIClient();
  const feature = options.feature || 'knowledge';
  const model = options.model || config.embeddingModel;

  try {
    const { result: response, attempts, totalAttempts, durationMs } = await executeWithRetry(() =>
      ai.models.embedContent({
        model,
        contents: text,
      })
    );

    const values = response.embedding?.values || response.embeddings?.[0]?.values;

    if (!values || !Array.isArray(values)) {
      throw new Error(SERVER_MESSAGES.ERRORS.EMBEDDING_FAILED);
    }

    recordUsage({
      feature,
      operation: 'embedText',
      provider: 'google-genai',
      model,
      outcome: 'success',
      durationMs,
      attempts,
      totalAttempts,
      promptVersion: null,
      toolsExecuted: [],
      tokenUsage: {
        inputTokens: null,
        outputTokens: 0,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });

    return values;
  } catch (error) {
    const executionMeta = error.executionMetadata || {
      attempts: [{ attemptNumber: 1, durationMs: 0, status: 'failure', error: error.message }],
      totalAttempts: 1,
      durationMs: 0,
    };

    recordUsage({
      feature,
      operation: 'embedText',
      provider: 'google-genai',
      model,
      outcome: 'failure',
      durationMs: executionMeta.durationMs,
      attempts: executionMeta.attempts,
      totalAttempts: executionMeta.totalAttempts,
      promptVersion: null,
      toolsExecuted: [],
      error,
      tokenUsage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });

    throw error;
  }
}

/**
 * Calls Gemini text generation with the given prompt.
 *
 * @param {string} prompt - Prompt or question for Gemini
 * @param {object} [options]
 * @param {string} [options.feature='chat']
 * @returns {Promise<string>} Generated text response
 */
export async function generateAnswer(prompt, options = {}) {
  const ai = getAIClient();
  const feature = options.feature || 'chat';
  const model = options.model || config.geminiModel;
  const promptId = options.promptId || null;
  const promptVersion = options.promptVersion || null;
  const promptHash = hashPrompt(prompt);

  try {
    const { result: response, attempts, totalAttempts, durationMs } = await executeWithRetry(() =>
      ai.models.generateContent({
        model,
        contents: prompt,
      })
    );

    // Extract usage metadata if provided by provider
    const usageMetadata = response.usageMetadata;
    const inputTokens = typeof usageMetadata?.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null;
    const outputTokens = typeof usageMetadata?.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : null;
    const totalTokens = typeof usageMetadata?.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : null;

    // Check for provider refusal signals (e.g. SAFETY finishReason)
    const firstCandidate = response.candidates?.[0];
    const finishReason = firstCandidate?.finishReason;
    const isRefusal = finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST';

    recordUsage({
      feature,
      operation: 'generateAnswer',
      provider: 'google-genai',
      model,
      outcome: isRefusal ? 'refusal' : 'success',
      isRefusal,
      refusalReason: isRefusal ? finishReason : null,
      durationMs,
      attempts,
      totalAttempts,
      promptId,
      promptVersion,
      promptHash,
      toolsExecuted: [],
      tokenUsage: {
        inputTokens,
        outputTokens,
        totalTokens,
        tokenCountsAvailable: inputTokens !== null,
      },
    });

    const rawAnswer = response.text || '';
    const validated = validateChatResponse(rawAnswer);
    return validated.answer;
  } catch (error) {
    const executionMeta = error.executionMetadata || {
      attempts: [{ attemptNumber: 1, durationMs: 0, status: 'failure', error: error.message }],
      totalAttempts: 1,
      durationMs: 0,
    };

    recordUsage({
      feature,
      operation: 'generateAnswer',
      provider: 'google-genai',
      model,
      outcome: 'failure',
      durationMs: executionMeta.durationMs,
      attempts: executionMeta.attempts,
      totalAttempts: executionMeta.totalAttempts,
      promptId,
      promptVersion,
      promptHash,
      toolsExecuted: [],
      error,
      tokenUsage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });

    throw error;
  }
}

/**
 * Calls Gemini text generation with streaming for the given prompt.
 *
 * @param {string} prompt - Prompt or question for Gemini
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - Optional AbortSignal for request cancellation
 * @param {string} [options.feature='chat']
 * @returns {Promise<AsyncIterable<any>>} Async iterable of chunks
 */
export async function generateAnswerStream(prompt, options = {}) {
  const ai = options.ai || getAIClient();
  const feature = options.feature || 'chat';
  const model = options.model || config.geminiModel;
  const promptId = options.promptId || null;
  const promptVersion = options.promptVersion || null;
  const promptHash = hashPrompt(prompt);

  const requestConfig = {};
  if (options.signal) {
    requestConfig.abortSignal = options.signal;
  }

  let rawStream;
  let attempts;
  let totalAttempts;
  let streamInitDuration;

  try {
    const executed = await executeWithRetry(
      () =>
        ai.models.generateContentStream({
          model,
          contents: prompt,
          config: requestConfig,
        }),
      undefined,
      undefined,
      undefined,
      undefined,
      options.signal
    );
    rawStream = executed.result;
    attempts = executed.attempts;
    totalAttempts = executed.totalAttempts;
    streamInitDuration = executed.durationMs;
  } catch (error) {
    const executionMeta = error.executionMetadata || {
      attempts: [{ attemptNumber: 1, durationMs: 0, status: 'failure', error: error.message }],
      totalAttempts: 1,
      durationMs: 0,
    };

    recordUsage({
      feature,
      operation: 'generateAnswerStream',
      provider: 'google-genai',
      model,
      outcome: 'failure',
      durationMs: executionMeta.durationMs,
      attempts: executionMeta.attempts,
      totalAttempts: executionMeta.totalAttempts,
      promptId,
      promptVersion,
      promptHash,
      toolsExecuted: [],
      error,
      tokenUsage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        tokenCountsAvailable: false,
      },
    });

    throw error;
  }

  // Return wrapped async generator to capture streaming usage metadata and terminal completion
  return (async function* trackedStream() {
    const streamStart = Date.now();
    let capturedUsageMetadata = null;
    let streamRefusalReason = null;
    let isStreamRefusal = false;
    let recorded = false;
    let timeToFirstTokenMs = null;
    let streamError = null;

    try {
      for await (const chunk of rawStream) {
        if (timeToFirstTokenMs === null && chunk.text) {
          timeToFirstTokenMs = Date.now() - streamStart;
        }
        if (chunk.usageMetadata) {
          capturedUsageMetadata = chunk.usageMetadata;
        }
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) {
          const fr = candidate.finishReason;
          if (fr === 'SAFETY' || fr === 'RECITATION' || fr === 'BLOCKLIST') {
            isStreamRefusal = true;
            streamRefusalReason = fr;
          }
        }
        yield chunk;
      }
    } catch (err) {
      streamError = err;
      throw err;
    } finally {
      if (!recorded) {
        recorded = true;
        const totalStreamDuration = streamInitDuration + (Date.now() - streamStart);
        const isAborted = Boolean(options.signal?.aborted);

        if (streamError || isAborted) {
          recordUsage({
            feature,
            operation: 'generateAnswerStream',
            provider: 'google-genai',
            model,
            outcome: isAborted ? 'aborted' : 'failure',
            durationMs: totalStreamDuration,
            timeToFirstTokenMs,
            attempts,
            totalAttempts,
            promptId,
            promptVersion,
            promptHash,
            toolsExecuted: [],
            error: streamError || (isAborted ? new Error('Generation aborted by client') : null),
            tokenUsage: normalizeUsageMetadata(capturedUsageMetadata),
          });
        } else {
          recordUsage({
            feature,
            operation: 'generateAnswerStream',
            provider: 'google-genai',
            model,
            outcome: isStreamRefusal ? 'refusal' : 'success',
            isRefusal: isStreamRefusal,
            refusalReason: streamRefusalReason,
            durationMs: totalStreamDuration,
            timeToFirstTokenMs,
            attempts,
            totalAttempts,
            promptId,
            promptVersion,
            promptHash,
            toolsExecuted: [],
            tokenUsage: normalizeUsageMetadata(capturedUsageMetadata),
          });
        }
      }
    }
  })();
}

/**
 * Downsamples and normalizes orientation for large receipt images before sending to vision models.
 * Preserves high enough resolution for OCR (1600px max) while drastically reducing payload & patch tiling latency.
 */
async function prepareImageForExtraction(image) {
  if (!image?.buffer) return image;
  try {
    const buffer = await sharp(image.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer, mimeType: 'image/jpeg' };
  } catch {
    return image;
  }
}

/**
 * Extracts a strictly validated, review-only receipt draft from image bytes.
 * The configured model is not assumed to support vision/JSON mode: provider
 * errors are surfaced as safe failures and must be live-probed before release.
 */
export async function extractReceiptImage(image, options = {}) {
  if (!image?.buffer || !Buffer.isBuffer(image.buffer) || image.buffer.length === 0) {
    throw new AIResponseValidationError('Receipt image buffer is missing or empty.');
  }
  const preparedImage = await prepareImageForExtraction(image);
  const ai = options.ai || getAIClient();
  const model = options.model || config.geminiReceiptModel || config.geminiModel;

  const prompt = options.prompt || 'Extract structured receipt data as JSON.';
  const promptId = options.promptId || null;
  const promptVersion = options.promptVersion || null;
  const schema = options.schema || { safeParse: (data) => ({ success: true, data }) };
  const categories = options.categories || ALL_CATEGORIES;
  const guardrailsFn = options.guardrailsFn || (() => {});

  const timeoutMs = options.timeoutMs ?? GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  try {
    const { result, attempts, totalAttempts, durationMs } = await executeWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [
        { text: prompt },
        { inlineData: { mimeType: preparedImage.mimeType, data: preparedImage.buffer.toString('base64') } },
      ] }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            documentType: { type: 'string', enum: ['receipt', 'invoice', 'unknown'] },
            transactionType: { type: 'string', enum: ['expense', 'income', 'unknown'] },
            merchant: { type: ['string', 'null'] },
            transactionDate: {
              type: ['string', 'null'],
              description: 'The purchase or transaction date printed on this specific receipt in YYYY-MM-DD format. Null if missing, ambiguous, or unreadable. Never use today\'s date or upload date.',
            },
            totalAmount: {
              type: ['number', 'null'],
              description: 'The final grand total, total paid, or amount due printed on this receipt. Never use subtotal, tax amount, discount, tip, cash tendered, or change.',
            },
            currency: { type: 'string' },
            category: { type: 'string', enum: categories },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  amount: { type: ['number', 'null'] },
                },
              },
            },
          },
        },
        temperature: 0,
      },
    }), undefined, undefined, timeoutMs);
    const validated = validateStructuredOutput(result.text || '', schema, { throwOnError: true });
    guardrailsFn(validated.data);
    const usage = result.usageMetadata || {};
    recordUsage({ feature: 'receipt_extraction', operation: 'extractReceiptImage', provider: 'google-genai', model,
      outcome: 'success', durationMs, attempts, totalAttempts, promptId, promptVersion,
      promptHash: hashPrompt(prompt), toolsExecuted: [], tokenUsage: normalizeUsageMetadata(usage),
    });
    return { extraction: validated.data, provider: 'google-genai', model, latencyMs: Date.now() - started, tokenUsage: usage };
  } catch (error) {
    const meta = error.executionMetadata || { attempts: [], totalAttempts: 1, durationMs: Date.now() - started };
    recordUsage({ feature: 'receipt_extraction', operation: 'extractReceiptImage', provider: 'google-genai', model,
      outcome: 'failure', durationMs: meta.durationMs, attempts: meta.attempts, totalAttempts: meta.totalAttempts,
      promptId, promptVersion, promptHash: hashPrompt(prompt), toolsExecuted: [], error,
      tokenUsage: normalizeUsageMetadata(null),
    });
    throw error;
  }
}

/**
 * Normalizes Gemini finishReason & usageMetadata into provider-agnostic telemetry fields.
 */
function extractResponseTelemetry(response) {
  const candidate = response?.candidates?.[0];
  const finishReason = candidate?.finishReason || null;
  const isRefusal = finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST';
  return {
    finishReason,
    isRefusal,
    tokenUsage: normalizeUsageMetadata(response?.usageMetadata),
  };
}

/**
 * Executes a single tool-selection turn using Gemini function calling.
 * Normalizes function-call and refusal/usage metadata into provider-agnostic output.
 */
export async function generateToolTurn({
  prompt,
  systemInstruction,
  tools = [],
  model: modelOverride,
  timeoutMs = GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS,
  maxRetries = RETRY_CONFIG.MAX_RETRIES,
  initialDelayMs = RETRY_CONFIG.INITIAL_DELAY_MS,
  timeoutMessage = SERVER_MESSAGES.ERRORS.AI_TIMEOUT,
  ai: aiOverride,
} = {}) {
  const ai = aiOverride || getAIClient();
  const model = modelOverride || config.geminiModel;
  const executed = await executeWithRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
          toolConfig: tools.length > 0 ? { functionCallingConfig: { mode: 'AUTO' } } : undefined,
        },
      }),
    maxRetries,
    initialDelayMs,
    timeoutMs,
    timeoutMessage
  );

  const response = executed.result;
  const telemetry = extractResponseTelemetry(response);
  const rawCalls = Array.isArray(response?.functionCalls) ? response.functionCalls : [];
  const functionCalls = rawCalls.map((call) => ({
    ...(call.id ? { id: call.id } : {}),
    name: call.name,
    args: call.args || {},
  }));
  const firstCall = functionCalls[0] || null;

  return {
    provider: 'google-genai',
    model,
    text: response?.text?.trim() || '',
    toolCall: firstCall,
    functionCalls,
    rawAssistantContent: response?.candidates?.[0]?.content || null,
    ...telemetry,
    attempts: executed.attempts,
    totalAttempts: executed.totalAttempts,
    durationMs: executed.durationMs,
  };
}

/**
 * Executes a follow-up generation turn after executing a tool call.
 */
export async function generateToolFollowup({
  prompt,
  systemInstruction,
  rawAssistantContent,
  toolName,
  toolResult,
  model: modelOverride,
  timeoutMs = GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS,
  maxRetries = RETRY_CONFIG.MAX_RETRIES,
  initialDelayMs = RETRY_CONFIG.INITIAL_DELAY_MS,
  timeoutMessage = SERVER_MESSAGES.ERRORS.AI_TIMEOUT,
  ai: aiOverride,
} = {}) {
  const ai = aiOverride || getAIClient();
  const model = modelOverride || config.geminiModel;
  const executed = await executeWithRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          rawAssistantContent,
          { role: 'user', parts: [{ functionResponse: { name: toolName, response: toolResult } }] },
        ],
        config: { systemInstruction },
      }),
    maxRetries,
    initialDelayMs,
    timeoutMs,
    timeoutMessage
  );

  const response = executed.result;
  const telemetry = extractResponseTelemetry(response);

  return {
    provider: 'google-genai',
    model,
    text: response?.text?.trim() || '',
    ...telemetry,
    attempts: executed.attempts,
    totalAttempts: executed.totalAttempts,
    durationMs: executed.durationMs,
  };
}

/**
 * Streams a single tool-selection or final-answer turn via Gemini generateContentStream.
 * Yields `{ type: 'text', text }` incrementally as chunks arrive, and concludes with
 * `{ type: 'turn_complete', text, toolCall, functionCalls, rawAssistantContent, finishReason, isRefusal, tokenUsage }`.
 */
export async function generateToolTurnStream({
  prompt,
  systemInstruction,
  tools = [],
  model: modelOverride,
  timeoutMs = GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS,
  maxRetries = RETRY_CONFIG.MAX_RETRIES,
  initialDelayMs = RETRY_CONFIG.INITIAL_DELAY_MS,
  timeoutMessage = SERVER_MESSAGES.ERRORS.AI_TIMEOUT,
  signal,
  ai: aiOverride,
} = {}) {
  const ai = aiOverride || getAIClient();
  const model = modelOverride || config.geminiModel;

  const requestConfig = { systemInstruction };
  if (tools.length > 0) {
    requestConfig.tools = [{ functionDeclarations: tools }];
    requestConfig.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  if (signal) {
    requestConfig.abortSignal = signal;
  }

  const executed = await executeWithRetry(
    () =>
      ai.models.generateContentStream({
        model,
        contents: prompt,
        config: requestConfig,
      }),
    maxRetries,
    initialDelayMs,
    timeoutMs,
    timeoutMessage,
    signal
  );

  const rawStream = executed.result;

  return (async function* streamTurn() {
    const streamStart = Date.now();
    let timeToFirstTokenMs = null;
    let fullText = '';
    const collectedCalls = [];
    const accumulatedParts = [];
    let assistantRole = 'model';
    let finishReason = null;
    let usageMetadata = null;

    for await (const chunk of rawStream) {
      if (signal?.aborted) {
        const abortErr = new Error('Generation aborted by client');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (!chunk || typeof chunk !== 'object') {
        continue;
      }

      const candidate = chunk.candidates?.[0];
      const candidateParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : null;
      let chunkText = '';
      if (typeof chunk.text === 'string' && chunk.text.length > 0) {
        chunkText = chunk.text;
      } else if (candidateParts) {
        chunkText = candidateParts
          .filter((part) => typeof part?.text === 'string' && part.text.length > 0 && !part.thought)
          .map((part) => part.text)
          .join('');
      }

      if (chunkText.length > 0) {
        if (timeToFirstTokenMs === null) {
          timeToFirstTokenMs = Date.now() - streamStart;
        }
        fullText += chunkText;
        yield { type: 'text', text: chunkText };
      }

      if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
        for (const call of chunk.functionCalls) {
          if (call?.name) {
            collectedCalls.push({
              ...(call.id ? { id: call.id } : {}),
              name: call.name,
              args: call.args || {},
            });
          }
        }
      } else if (candidateParts) {
        for (const part of candidateParts) {
          if (part?.functionCall?.name) {
            collectedCalls.push({
              ...(part.functionCall.id ? { id: part.functionCall.id } : {}),
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            });
          }
        }
      }

      if (candidate?.content) {
        if (candidate.content.role) {
          assistantRole = candidate.content.role;
        }
        if (candidateParts && candidateParts.length > 0) {
          accumulatedParts.push(...candidateParts);
        }
      }
      if (candidate?.finishReason) {
        finishReason = candidate.finishReason;
      }
      if (chunk.usageMetadata) {
        usageMetadata = chunk.usageMetadata;
      }
    }

    const rawAssistantContent = accumulatedParts.length > 0
      ? { role: assistantRole, parts: accumulatedParts }
      : null;
    const isRefusal = finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST';
    const tokenUsage = normalizeUsageMetadata(usageMetadata);

    yield {
      type: 'turn_complete',
      provider: 'google-genai',
      model,
      text: fullText.trim(),
      toolCall: collectedCalls[0] || null,
      functionCalls: collectedCalls,
      rawAssistantContent,
      finishReason,
      isRefusal,
      timeToFirstTokenMs,
      tokenUsage,
    };
  })();
}

/**
 * Gemini AI Provider implementation object.
 */
export const geminiProvider = {
  name: 'gemini',
  capabilities: Object.freeze({
    textGeneration: true,
    streaming: true,
    toolCalling: true,
    structuredOutput: true,
    multimodal: true,
    embeddings: true,
  }),
  getAIClient,
  executeWithRetry,
  embedText,
  generateAnswer,
  generateAnswerStream,
  extractReceiptImage,
  generateToolTurn,
  generateToolTurnStream,
  generateToolFollowup,
};
