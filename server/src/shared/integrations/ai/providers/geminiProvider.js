import { GoogleGenAI } from '@google/genai';
import { config } from '../../../../config.js';
import { SERVER_MESSAGES, RETRY_CONFIG, SERVER_CONFIG_DEFAULTS, GUARDRAIL_CONFIG } from '../../../../constants/index.js';
import { recordUsage, hashPrompt } from '../../../../features/analytics/index.js';
import { validateChatResponse, withTimeout, validateStructuredOutput } from '../../../guardrails/index.js';
import { RECEIPT_CATEGORIES, receiptExtractionSchema } from '../../../../features/expenses/receipt.schemas.js';
import { enforceReceiptGuardrails } from '../../../../features/expenses/receiptGuardrails.js';
import { getReceiptPrompt, RECEIPT_PROMPT_ID, RECEIPT_PROMPT_VERSION } from '../../../../features/expenses/receiptPrompt.js';

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
  customTimeoutMessage = SERVER_MESSAGES.ERRORS.AI_TIMEOUT
) {
  const attempts = [];
  const startOverall = Date.now();
  let attemptNumber = 0;

  while (true) {
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
      const isTransient =
        status === 429 ||
        status === 503 ||
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota');

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
  const model = options.model || config.geminiReceiptModel;
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
  const ai = getAIClient();
  const feature = options.feature || 'chat';
  const model = options.model || config.geminiReceiptModel;
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
    const executed = await executeWithRetry(() =>
      ai.models.generateContentStream({
        model,
        contents: prompt,
        config: requestConfig,
      })
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
            outcome: 'failure',
            durationMs: totalStreamDuration,
            timeToFirstTokenMs,
            attempts,
            totalAttempts,
            promptId,
            promptVersion,
            promptHash,
            toolsExecuted: [],
            error: streamError || (isAborted ? new Error('Generation aborted by client') : null),
            tokenUsage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
              tokenCountsAvailable: false,
            },
          });
        } else {
          const inputTokens = typeof capturedUsageMetadata?.promptTokenCount === 'number'
            ? capturedUsageMetadata.promptTokenCount
            : null;
          const outputTokens = typeof capturedUsageMetadata?.candidatesTokenCount === 'number'
            ? capturedUsageMetadata.candidatesTokenCount
            : null;
          const totalTokens = typeof capturedUsageMetadata?.totalTokenCount === 'number'
            ? capturedUsageMetadata.totalTokenCount
            : null;

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
            tokenUsage: {
              inputTokens,
              outputTokens,
              totalTokens,
              tokenCountsAvailable: inputTokens !== null,
            },
          });
        }
      }
    }
  })();
}

/**
 * Extracts a strictly validated, review-only receipt draft from image bytes.
 * The configured model is not assumed to support vision/JSON mode: provider
 * errors are surfaced as safe failures and must be live-probed before release.
 */
export async function extractReceiptImage(image, options = {}) {
  const ai = getAIClient();
  const model = options.model || config.geminiReceiptModel || config.geminiModel;
  const prompt = options.prompt || getReceiptPrompt();
  const started = Date.now();
  try {
    const { result, attempts, totalAttempts, durationMs } = await executeWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.buffer.toString('base64') } },
      ] }],
      config: { responseMimeType: 'application/json', responseJsonSchema: { type: 'object', properties: { documentType: { type: 'string', enum: ['receipt', 'invoice', 'unknown'] }, transactionType: { type: 'string', enum: ['expense', 'income', 'unknown'] }, merchant: { type: ['string', 'null'] }, transactionDate: { type: ['string', 'null'] }, totalAmount: { type: ['number', 'null'] }, currency: { type: 'string' }, category: { type: 'string', enum: RECEIPT_CATEGORIES }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, amount: { type: ['number', 'null'] } } } } } }, temperature: 0 },
    }), undefined, undefined, options.timeoutMs);
    const validated = validateStructuredOutput(result.text || '', receiptExtractionSchema, { throwOnError: true });
    enforceReceiptGuardrails(validated.data);
    const usage = result.usageMetadata || {};
    recordUsage({ feature: 'receipt_extraction', operation: 'extractReceiptImage', provider: 'google-genai', model,
      outcome: 'success', durationMs, attempts, totalAttempts, promptId: RECEIPT_PROMPT_ID, promptVersion: RECEIPT_PROMPT_VERSION,
      promptHash: hashPrompt(prompt), toolsExecuted: [], tokenUsage: { inputTokens: usage.promptTokenCount ?? null, outputTokens: usage.candidatesTokenCount ?? null, totalTokens: usage.totalTokenCount ?? null, tokenCountsAvailable: typeof usage.promptTokenCount === 'number' },
    });
    return { extraction: validated.data, provider: 'google-genai', model, latencyMs: Date.now() - started, tokenUsage: usage };
  } catch (error) {
    const meta = error.executionMetadata || { attempts: [], totalAttempts: 1, durationMs: Date.now() - started };
    recordUsage({ feature: 'receipt_extraction', operation: 'extractReceiptImage', provider: 'google-genai', model,
      outcome: 'failure', durationMs: meta.durationMs, attempts: meta.attempts, totalAttempts: meta.totalAttempts,
      promptId: RECEIPT_PROMPT_ID, promptVersion: RECEIPT_PROMPT_VERSION, promptHash: hashPrompt(prompt), toolsExecuted: [], error,
      tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null, tokenCountsAvailable: false },
    });
    throw error;
  }
}

/**
 * Gemini AI Provider implementation object.
 */
export const geminiProvider = {
  name: 'gemini',
  getAIClient,
  executeWithRetry,
  embedText,
  generateAnswer,
  generateAnswerStream,
  extractReceiptImage,
};
