process.env.NODE_ENV = 'test';
process.env.FORCE_IN_MEMORY_ANALYTICS = 'true';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from '../../server/src/shared/integrations/index.js';
import {
  createUsageTracker,
  InMemoryUsageStore,
  categorizeError,
  recordUsage,
  getRecentUsageRecords,
  getUsageStore,
  hashPrompt,
  defaultUsageStore,
  SupabaseUsageWriter,
  analyticsFilterSchema,
  analyticsHistorySchema,
  getAnalyticsOverview,
  getAnalyticsTimeseries,
  getAnalyticsBreakdown,
  getAnalyticsHistory,
  calculatePercentile,
  PERCENTILES,
  groupRecordsIntoTimeBuckets,
  calculateDistributions,
  formatRecordForDb,
  formatDbToRecord,
  calculateOverviewMetrics,
  PRICING_VERSION,
  MODEL_PRICING_REGISTRY,
  calculateRequestCost,
  normalizeModelName,
} from '../../server/src/features/analytics/index.js';

describe('AI Usage Analytics Suite', () => {
  let tracker;
  let store;

  beforeEach(() => {
    store = new InMemoryUsageStore(10);
    tracker = createUsageTracker({ store });
  });

  describe('1. Usage Record Normalization and Metadata Capture', () => {
    it('creates a normalized usage record with unique ID and timestamp for successful call', () => {
      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        provider: 'google-genai',
        model: 'gemini-2.5-flash',
        durationMs: 450,
        timeToFirstTokenMs: 120,
        tokenUsage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
        },
        promptVersion: 'abc123sha256',
        toolsExecuted: [],
      });

      assert.ok(record);
      assert.ok(record.id && typeof record.id === 'string');
      assert.ok(record.timestamp && typeof record.timestamp === 'string');
      assert.equal(record.feature, 'chat');
      assert.equal(record.operation, 'generateAnswer');
      assert.equal(record.provider, 'google-genai');
      assert.equal(record.model, 'gemini-2.5-flash');
      assert.equal(record.outcome, 'success');
      assert.equal(record.refusal, false);
      assert.equal(record.refusalReason, null);
      assert.equal(record.durationMs, 450);
      assert.equal(record.timeToFirstTokenMs, 120);
      assert.equal(record.promptVersion, 'abc123sha256');
      assert.deepEqual(record.toolsExecuted, []);
      assert.equal(record.error, null);

      // Verify token counts
      assert.equal(record.tokenUsage.inputTokens, 120);
      assert.equal(record.tokenUsage.outputTokens, 45);
      assert.equal(record.tokenUsage.totalTokens, 165);
      assert.equal(record.tokenUsage.tokenCountsAvailable, true);
      assert.equal(record.tokenUsage.tokenCountsComplete, true);

      // Verify calculated cost telemetry
      assert.ok(record.cost);
      assert.equal(record.cost.costStatus, 'calculated');
      assert.equal(record.cost.currency, 'USD');
      assert.ok(typeof record.cost.estimatedCostUsd === 'number');
      assert.equal(record.estimatedCost, record.cost.estimatedCostUsd);
      assert.equal(record.costStatus, 'calculated');
    });

    it('records provider retry attempts and history correctly', () => {
      const attempts = [
        { attemptNumber: 1, durationMs: 120, status: 'failure', error: '503 Service Unavailable' },
        { attemptNumber: 2, durationMs: 340, status: 'success' },
      ];

      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        provider: 'google-genai',
        model: 'gemini-2.5-flash',
        durationMs: 460,
        attempts,
        totalAttempts: 2,
        tokenUsage: { inputTokens: 50, outputTokens: 20 },
      });

      assert.equal(record.attemptCount, 2);
      assert.equal(record.attempts.length, 2);
      assert.equal(record.attempts[0].status, 'failure');
      assert.equal(record.attempts[1].status, 'success');
      assert.equal(record.outcome, 'success');
    });

    it('handles missing token metadata accurately without fabricating counts', () => {
      const record = tracker.trackUsage({
        feature: 'knowledge',
        operation: 'embedText',
        provider: 'google-genai',
        model: 'text-embedding-004',
        durationMs: 150,
        tokenUsage: {
          inputTokens: null,
          outputTokens: 0,
        },
      });

      assert.equal(record.tokenUsage.inputTokens, null);
      assert.equal(record.tokenUsage.totalTokens, null);
      assert.equal(record.tokenUsage.tokenCountsAvailable, false);
      assert.equal(record.tokenUsage.tokenCountsComplete, false);
    });
  });

  describe('2. Prompt Versioning Determinism and Tool Execution', () => {
    it('produces identical SHA-256 hash for identical resolved prompts', () => {
      const prompt1 = 'You are a helpful SpendWise assistant.';
      const prompt2 = 'You are a helpful SpendWise assistant.';
      const hash1 = hashPrompt(prompt1);
      const hash2 = hashPrompt(prompt2);

      assert.ok(hash1 && typeof hash1 === 'string');
      assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
      assert.equal(hash1, hash2, 'Identical prompt content must produce exact same hash');
    });

    it('produces different hashes when prompt content changes', () => {
      const promptA = 'You are a helpful SpendWise assistant.';
      const promptB = 'You are a helpful SpendWise assistant. Be concise.';
      const hashA = hashPrompt(promptA);
      const hashB = hashPrompt(promptB);

      assert.notEqual(hashA, hashB, 'Modified prompt must yield a different SHA-256 hash');
    });

    it('returns null when prompt is not provided or invalid', () => {
      assert.equal(hashPrompt(null), null);
      assert.equal(hashPrompt(''), null);
      assert.equal(hashPrompt(123), null);
    });

    it('honestly represents absence of tool execution without inventing agent actions', () => {
      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        durationMs: 200,
      });

      assert.deepEqual(record.toolsExecuted, []);
    });

    it('separates id, promptId, promptVersion, and promptHash cleanly', () => {
      const promptText = 'Extract all expense items from this receipt.';
      const expectedHash = hashPrompt(promptText);

      const record = tracker.trackUsage({
        feature: 'receipt_extraction',
        operation: 'extractReceiptImage',
        promptId: 'receipt_extraction',
        promptVersion: 'receipt-v3',
        prompt: promptText,
        durationMs: 300,
      });

      assert.ok(record.id && typeof record.id === 'string');
      assert.equal(record.promptId, 'receipt_extraction');
      assert.equal(record.promptVersion, 'receipt-v3');
      assert.equal(record.promptHash, expectedHash);
      assert.equal(record.promptHash.length, 64);
    });

    it('normalizes legacy pure 64-character SHA-256 hash in promptVersion without inventing versions', () => {
      const rawSha256 = '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc';

      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        promptVersion: rawSha256,
        durationMs: 150,
      });

      assert.equal(record.promptHash, rawSha256);
      assert.equal(record.promptVersion, null, 'Explicit version must not be invented for historical pure hashes');
    });

    it('normalizes legacy composite <version>:<hash> and <id>:<version>:<hash> without data loss', () => {
      const hash1 = 'ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243';
      const record1 = tracker.trackUsage({
        feature: 'receipt_extraction',
        operation: 'extractReceiptImage',
        promptVersion: `receipt-v3:${hash1}`,
        durationMs: 200,
      });
      assert.equal(record1.promptVersion, 'receipt-v3');
      assert.equal(record1.promptHash, hash1);

      const hash2 = '8c9b578b288b9dd0d2ce299b3cd64a2404d188cef9c14db5fc5dd9446699311f';
      const record2 = tracker.trackUsage({
        feature: 'expense_agent',
        operation: 'assistant',
        promptVersion: `expense_agent_assistant:v1:${hash2}`,
        durationMs: 350,
      });
      assert.equal(record2.promptId, 'expense_agent_assistant');
      assert.equal(record2.promptVersion, 'v1');
      assert.equal(record2.promptHash, hash2);
    });
  });

  describe('3. Refusal, Error Classification, and Sanitization', () => {
    it('classifies provider safety finishReason as refusal, not technical failure', () => {
      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        provider: 'google-genai',
        model: 'gemini-2.5-flash',
        refusal: true,
        refusalReason: 'SAFETY',
        durationMs: 210,
        tokenUsage: { inputTokens: 40, outputTokens: 0 },
      });

      assert.equal(record.outcome, 'refusal');
      assert.equal(record.refusal, true);
      assert.equal(record.refusalReason, 'SAFETY');
      assert.equal(record.error, null);
    });

    it('categorizes various provider errors into operational categories', () => {
      assert.equal(categorizeError({ message: 'Resource has been exhausted (429)' }), 'RATE_LIMIT');
      assert.equal(categorizeError({ message: 'The service is unavailable (503)' }), 'SERVICE_UNAVAILABLE');
      assert.equal(categorizeError({ message: 'API_KEY_INVALID: User not authorized' }), 'AUTHENTICATION');
      assert.equal(categorizeError({ name: 'AbortError', message: 'The user aborted a request.' }), 'ABORTED');
      assert.equal(categorizeError({ message: 'Invalid argument provided' }), 'INVALID_ARGUMENT');
      assert.equal(categorizeError({ message: 'ETIMEDOUT connection failed' }), 'TIMEOUT');
      assert.equal(categorizeError({ message: 'fetch failed: ECONNRESET' }), 'NETWORK');
      assert.equal(categorizeError({ message: 'Something completely random broke' }), 'PROVIDER_ERROR');
    });

    it('sanitizes API keys and sensitive tokens in both top-level and nested attempt errors', () => {
      const rawError = new Error('503 Service Unavailable: AIzaSyD3FakeApiKeySecret1234567890');
      const nestedAttemptError = { message: 'Failed with key AIzaSyNestedSecretKey987654321' };

      const record = tracker.trackUsage({
        feature: 'chat',
        operation: 'generateAnswer',
        model: 'gemini-2.5-flash',
        durationMs: 100,
        error: rawError,
        attempts: [
          { attemptNumber: 1, durationMs: 50, status: 'failure', error: nestedAttemptError },
        ],
      });

      assert.equal(record.outcome, 'failure');
      assert.ok(record.error);
      assert.equal(record.error.category, 'SERVICE_UNAVAILABLE');
      assert.ok(!record.error.message.includes('AIzaSyD3FakeApiKeySecret1234567890'));
      assert.ok(record.error.message.includes('[REDACTED_API_KEY]'));

      // Nested attempt sanitization
      assert.ok(!record.attempts[0].error.message.includes('AIzaSyNestedSecretKey987654321'));
      assert.ok(record.attempts[0].error.message.includes('[REDACTED_API_KEY]'));
    });
  });

  describe('4. In-Memory Store Correctness and Robustness', () => {
    it('returns empty array when getRecent(0) is requested', () => {
      tracker.trackUsage({ feature: 'chat', operation: 'generate', durationMs: 10 });
      tracker.trackUsage({ feature: 'chat', operation: 'generate', durationMs: 20 });

      const zeroResults = store.getRecent(0);
      assert.deepEqual(zeroResults, [], 'getRecent(0) must return empty array, not all records');

      const negativeResults = store.getRecent(-5);
      assert.deepEqual(negativeResults, [], 'Negative limits must return empty array');
    });

    it('bounds in-memory store and handles async subscriber rejections safely', async () => {
      // Async subscriber that rejects
      const unsubscribe = store.subscribe(async () => {
        throw new Error('Async sink write failure');
      });

      // Tracking should not throw or unhandled reject
      assert.doesNotThrow(() => {
        tracker.trackUsage({ feature: 'chat', operation: 'test', durationMs: 50 });
      });

      unsubscribe();
    });

    it('preserves FIFO bounding when store capacity is exceeded', () => {
      for (let i = 1; i <= 15; i++) {
        tracker.trackUsage({
          feature: 'chat',
          operation: 'generateAnswer',
          durationMs: i,
        });
      }

      assert.equal(store.count, 10);
      const recent = store.getRecent(10);
      assert.equal(recent[0].durationMs, 6);
      assert.equal(recent[9].durationMs, 15);
    });
  });

  describe('5. Supabase Persistence and Queueing', () => {
    it('handles missing configuration gracefully without throwing', async () => {
      const unconfiguredWriter = new SupabaseUsageWriter({
        client: null,
        flushIntervalMs: 0,
      });

      assert.equal(unconfiguredWriter.isConfigured, false);
      assert.equal(unconfiguredWriter.isDurable, false);

      // Enqueueing should safely buffer
      assert.doesNotThrow(() => {
        unconfiguredWriter.enqueue({ id: 'rec-1', feature: 'test' });
      });
      assert.equal(unconfiguredWriter.queueLength, 1);

      // Flushing without configuration must safely discard to prevent memory leak
      await unconfiguredWriter.flush();
      assert.equal(unconfiguredWriter.queueLength, 0);

      unconfiguredWriter.destroy();
    });

    it('drops records gracefully when queue reaches maximum capacity', () => {
      const mockClient = { from: () => ({ upsert: async () => ({ error: null }) }) };
      const writer = new SupabaseUsageWriter({
        client: mockClient,
        maxQueueSize: 5,
        flushIntervalMs: 60000, // Do not auto flush
      });

      for (let i = 1; i <= 10; i++) {
        writer.enqueue({ id: `rec-${i}`, durationMs: i });
      }

      assert.equal(writer.queueLength, 5, 'Queue must be capped at maxQueueSize');
      assert.equal(writer.stats.saturatedDrops, 5, 'Excess records must be counted as saturatedDrops');

      writer.destroy();
    });

    it('performs batched idempotent upsert with onConflict on id', async () => {
      let upsertPayload = null;
      let upsertOptions = null;

      const mockClient = {
        from: (table) => {
          assert.equal(table, 'ai_usage_analytics');
          return {
            upsert: async (records, opts) => {
              upsertPayload = records;
              upsertOptions = opts;
              return { error: null };
            },
          };
        },
      };

      const writer = new SupabaseUsageWriter({
        client: mockClient,
        batchSize: 5,
        flushIntervalMs: 60000,
      });

      writer.enqueue({
        id: 'rec-abc',
        timestamp: new Date().toISOString(),
        feature: 'rag_chat',
        operation: 'generate_stream',
        provider: 'google',
        model: 'gemini-2.5-flash',
        outcome: 'success',
        durationMs: 300,
        tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, tokenCountsAvailable: true },
      });

      await writer.flush();

      assert.ok(upsertPayload);
      assert.equal(upsertPayload.length, 1);
      assert.equal(upsertPayload[0].id, 'rec-abc');
      assert.equal(upsertPayload[0].feature, 'rag_chat');
      assert.deepEqual(upsertOptions, { onConflict: 'id', ignoreDuplicates: true });
      assert.equal(writer.stats.totalInserted, 1);

      writer.destroy();
    });

    it('retries transient failures with bounded attempts', async () => {
      let callCount = 0;
      const mockClient = {
        from: () => ({
          upsert: async () => {
            callCount++;
            if (callCount === 1) {
              return { error: { message: '503 Connection Timeout' } };
            }
            return { error: null };
          },
        }),
      };

      const writer = new SupabaseUsageWriter({
        client: mockClient,
        batchSize: 5,
        maxRetries: 2,
        flushIntervalMs: 60000,
      });

      writer.enqueue({ id: 'rec-retry', durationMs: 100 });
      await writer.flush();

      assert.equal(callCount, 2, 'Must have retried after initial transient failure');
      assert.equal(writer.stats.totalInserted, 1);
      assert.equal(writer.stats.failedInserts, 0);

      writer.destroy();
    });
  });

  describe('6. Analytics Backend Query & Aggregation Services', () => {
    beforeEach(() => {
      // Seed defaultUsageStore with test records for query testing
      const now = new Date();
      defaultUsageStore.add({
        id: 'rec-query-1',
        timestamp: new Date(now.getTime() - 1000 * 60).toISOString(),
        feature: 'rag_chat',
        operation: 'generate_answer_stream',
        provider: 'google',
        model: 'gemini-2.5-flash',
        outcome: 'success',
        durationMs: 200,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, tokenCountsAvailable: true },
      });
      defaultUsageStore.add({
        id: 'rec-query-2',
        timestamp: new Date(now.getTime() - 1000 * 30).toISOString(),
        feature: 'rag_chat',
        operation: 'generate_answer_stream',
        provider: 'google',
        model: 'gemini-2.5-flash',
        outcome: 'failure',
        durationMs: 400,
        tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null, tokenCountsAvailable: false },
        error: { category: 'TIMEOUT', message: 'Connection timed out' },
      });
      defaultUsageStore.add({
        id: 'rec-query-3',
        timestamp: now.toISOString(),
        feature: 'embedding',
        operation: 'embed_text',
        provider: 'google',
        model: 'text-embedding-004',
        outcome: 'success',
        durationMs: 100,
        tokenUsage: { inputTokens: 50, outputTokens: 0, totalTokens: 50, tokenCountsAvailable: true },
      });
    });

    it('calculates overview metrics, percentiles, and missing token counts', async () => {
      const overview = await getAnalyticsOverview({ timeRange: '1h' });

      assert.ok(overview);
      assert.ok(overview.totalRequests >= 3);
      assert.ok(overview.successCount >= 2);
      assert.ok(overview.failureCount >= 1);
      assert.ok(overview.recordsWithMissingTokens >= 1, 'Missing token metadata must be counted accurately');
      assert.ok(overview.avgLatencyMs > 0);
      assert.ok(overview.p50LatencyMs > 0);
      assert.ok(overview.p95LatencyMs >= overview.p50LatencyMs);
      assert.equal(overview.persistence.provider, 'in-memory');
    });

    it('groups timeseries data by date or hour buckets', async () => {
      const timeseries = await getAnalyticsTimeseries({ timeRange: '1h' });

      assert.ok(Array.isArray(timeseries));
      assert.ok(timeseries.length >= 1);
      assert.ok(timeseries[0].totalRequests > 0);
      assert.ok(typeof timeseries[0].dateLabel === 'string');
    });

    it('calculates breakdown distributions by feature, model, and outcome', async () => {
      const breakdown = await getAnalyticsBreakdown({ timeRange: '1h' });

      assert.ok(breakdown);
      assert.ok(Array.isArray(breakdown.byFeature));
      assert.ok(Array.isArray(breakdown.byModel));
      assert.ok(Array.isArray(breakdown.byOutcome));

      const ragFeature = breakdown.byFeature.find((f) => f.name === 'rag_chat');
      assert.ok(ragFeature && ragFeature.count >= 2);
    });

    it('paginates request history and supports outcome filtering', async () => {
      const page1 = await getAnalyticsHistory({ page: 1, limit: 2 });
      assert.equal(page1.page, 1);
      assert.equal(page1.limit, 2);
      assert.equal(page1.records.length, 2);

      const failedOnly = await getAnalyticsHistory({ outcome: 'failure' });
      assert.ok(failedOnly.records.every((r) => r.outcome === 'failure'));
    });

    it('validates query parameters with Zod schema', () => {
      const valid = analyticsFilterSchema.safeParse({
        timeRange: '24h',
        feature: 'rag_chat',
        outcome: 'success',
      });
      assert.equal(valid.success, true);

      const invalidDate = analyticsFilterSchema.safeParse({
        startDate: 'not-a-valid-date',
      });
      assert.equal(invalidDate.success, false);

      const validHistory = analyticsHistorySchema.safeParse({
        page: '2',
        limit: '50',
      });
      assert.equal(validHistory.success, true);
      assert.equal(validHistory.data.page, 2);
      assert.equal(validHistory.data.limit, 50);
    });
  });

  describe('7. Architecture Decoupling, Reusable Infrastructure, and Pure Utilities', () => {
    it('provides shared Supabase infrastructure completely independent of analytics', () => {
      // Shared client does not require analytics modules
      assert.equal(typeof isSupabaseConfigured, 'function');
      assert.equal(typeof getSupabaseClient, 'function');

      const isConfigured = isSupabaseConfigured();
      assert.equal(typeof isConfigured, 'boolean');
      const client = getSupabaseClient();
      if (!isConfigured) {
        assert.equal(client, null);
      } else {
        assert.ok(client);
      }
    });

    it('calculates quantiles and percentiles accurately as pure mathematical functions', () => {
      assert.equal(calculatePercentile([], 0.95), 0, 'Empty arrays must return 0');
      assert.equal(calculatePercentile([100], 0.95), 100, 'Single item array returns that item');

      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const p50 = calculatePercentile(latencies, PERCENTILES.P50);
      const p95 = calculatePercentile(latencies, PERCENTILES.P95);

      assert.equal(p50, 60);
      assert.equal(p95, 100);
    });

    it('groups records into chronological hourly and daily time buckets', () => {
      const records = [
        { timestamp: '2026-10-20T10:15:00Z', outcome: 'success', durationMs: 100, tokenUsage: { totalTokens: 50 } },
        { timestamp: '2026-10-20T10:45:00Z', outcome: 'failure', durationMs: 200, tokenUsage: { totalTokens: 25 } },
        { timestamp: '2026-10-20T11:00:00Z', outcome: 'success', durationMs: 150, tokenUsage: { totalTokens: 75 } },
      ];

      const hourlyBuckets = groupRecordsIntoTimeBuckets(records, true);
      assert.equal(hourlyBuckets.length, 2);
      assert.equal(hourlyBuckets[0].totalRequests, 2);
      assert.equal(hourlyBuckets[0].successCount, 1);
      assert.equal(hourlyBuckets[0].failureCount, 1);
      assert.equal(hourlyBuckets[0].totalTokens, 75);
      assert.equal(hourlyBuckets[0].avgLatencyMs, 150);

      const dailyBuckets = groupRecordsIntoTimeBuckets(records, false);
      assert.equal(dailyBuckets.length, 1);
      assert.equal(dailyBuckets[0].totalRequests, 3);
      assert.equal(dailyBuckets[0].totalTokens, 150);
    });

    it('computes category percentage distributions accurately', () => {
      const records = [
        { feature: 'rag_chat', model: 'gemini-2.5-flash', operation: 'stream', outcome: 'success' },
        { feature: 'rag_chat', model: 'gemini-2.5-flash', operation: 'stream', outcome: 'success' },
        { feature: 'embedding', model: 'text-embedding-004', operation: 'embed', outcome: 'success' },
        { feature: 'embedding', model: 'text-embedding-004', operation: 'embed', outcome: 'failure' },
      ];

      const distributions = calculateDistributions(records);
      assert.equal(distributions.total, 4);

      const ragFeature = distributions.byFeature.find((f) => f.name === 'rag_chat');
      assert.equal(ragFeature.count, 2);
      assert.equal(ragFeature.percentage, 50.0);

      const successOutcome = distributions.byOutcome.find((o) => o.name === 'success');
      assert.equal(successOutcome.count, 3);
      assert.equal(successOutcome.percentage, 75.0);
    });

    it('performs bidirectional model and database row mapping without loss of fields', () => {
      const originalRecord = {
        id: 'rec-test-123',
        timestamp: '2026-10-20T00:00:00.000Z',
        feature: 'rag_chat',
        operation: 'generate_answer_stream',
        provider: 'google-genai',
        model: 'gemini-2.5-flash',
        outcome: 'success',
        isRefusal: false,
        refusalReason: null,
        durationMs: 350,
        timeToFirstTokenMs: 120,
        totalAttempts: 1,
        attempts: [{ attemptNumber: 1, durationMs: 350, status: 'success' }],
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          tokenCountsAvailable: true,
          tokenCountsComplete: true,
        },
        promptId: 'prompt_expense_analysis',
        promptVersion: 'v1',
        promptHash: '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc',
        toolsExecuted: ['query_expenses'],
        estimatedCost: 0.0000225,
        costStatus: 'estimated',
        error: null,
      };

      const dbRow = formatRecordForDb(originalRecord);
      assert.equal(dbRow.id, originalRecord.id);
      assert.equal(dbRow.duration_ms, 350);
      assert.equal(dbRow.is_refusal, false);
      assert.equal(dbRow.input_tokens, 100);
      assert.equal(dbRow.prompt_id, 'prompt_expense_analysis');
      assert.equal(dbRow.prompt_version, 'v1');
      assert.equal(dbRow.prompt_hash, '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc');
      assert.equal(dbRow.estimated_cost, 0.0000225);
      assert.equal(dbRow.cost_status, 'estimated');
      assert.deepEqual(dbRow.tools_executed, ['query_expenses']);

      const reconstituted = formatDbToRecord(dbRow);
      assert.equal(reconstituted.id, originalRecord.id);
      assert.equal(reconstituted.durationMs, originalRecord.durationMs);
      assert.equal(reconstituted.timeToFirstTokenMs, originalRecord.timeToFirstTokenMs);
      assert.equal(reconstituted.tokenUsage.totalTokens, 150);
      assert.equal(reconstituted.tokenUsage.tokenCountsComplete, true);
      assert.equal(reconstituted.promptId, 'prompt_expense_analysis');
      assert.equal(reconstituted.promptVersion, 'v1');
      assert.equal(reconstituted.promptHash, '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc');
      assert.equal(reconstituted.estimatedCost, 0.0000225);
      assert.equal(reconstituted.costStatus, 'estimated');
      assert.deepEqual(reconstituted.toolsExecuted, ['query_expenses']);
      assert.equal(reconstituted.cost.estimatedCostUsd, 0.0000225);
    });

    it('decodes historical database rows with legacy prompt_version formats gracefully', () => {
      // Historical row 1: pure 64-hex SHA-256 hash in prompt_version, null prompt_id
      const row1 = {
        id: 'hist-1',
        timestamp: '2026-10-25T07:07:40.825Z',
        prompt_version: '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc',
        prompt_id: null,
      };
      const rec1 = formatDbToRecord(row1);
      assert.equal(rec1.promptHash, '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc');
      assert.equal(rec1.promptVersion, null, 'Must not invent an explicit version for historical pure hashes');

      // Historical row 2: composite <version>:<hash>
      const row2 = {
        id: 'hist-2',
        timestamp: '2026-10-25T07:10:00.000Z',
        prompt_version: 'receipt-v3:ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243',
        prompt_id: null,
      };
      const rec2 = formatDbToRecord(row2);
      assert.equal(rec2.promptVersion, 'receipt-v3');
      assert.equal(rec2.promptHash, 'ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243');
    });
  });

  describe('8. Centralized Pricing Configuration & Cost Calculations', () => {
    it('calculates request cost accurately for gemini-2.5-flash based on verified pricing', () => {
      // 100k input tokens = 0.1 * $0.075 = $0.0075
      // 10k output tokens = 0.01 * $0.30 = $0.0030
      // Total = $0.0105
      const cost = calculateRequestCost('gemini-2.5-flash', {
        inputTokens: 100000,
        outputTokens: 10000,
        tokenCountsAvailable: true,
      });

      assert.equal(cost.costStatus, 'calculated');
      assert.equal(cost.pricingVersion, PRICING_VERSION);
      assert.equal(cost.currency, 'USD');
      assert.equal(cost.inputCostUsd, 0.0075);
      assert.equal(cost.outputCostUsd, 0.003);
      assert.equal(cost.estimatedCostUsd, 0.0105);
    });

    it('calculates request cost accurately for gemini-3.5-flash-lite', () => {
      const cost = calculateRequestCost('gemini-3.5-flash-lite', {
        inputTokens: 100000,
        outputTokens: 10000,
        tokenCountsAvailable: true,
      });

      assert.equal(cost.costStatus, 'calculated');
      assert.equal(cost.pricingVersion, PRICING_VERSION);
      assert.ok(cost.estimatedCostUsd > 0);
    });

    it('handles embedding models without output tokens', () => {
      // 50,000 input tokens on text-embedding-004 ($0.02 / 1M) = 0.05 * 0.02 = 0.001 USD
      const cost = calculateRequestCost('text-embedding-004', {
        inputTokens: 50000,
        outputTokens: 0,
        tokenCountsAvailable: true,
      });

      assert.equal(cost.costStatus, 'calculated');
      assert.equal(cost.inputCostUsd, 0.001);
      assert.equal(cost.outputCostUsd, 0);
      assert.equal(cost.estimatedCostUsd, 0.001);
    });

    it('returns explicit missing_tokens status and null cost when token counts are missing without fabricating counts', () => {
      const missingTokens = calculateRequestCost('gemini-2.5-flash', {
        inputTokens: null,
        outputTokens: 20,
        tokenCountsAvailable: false,
      });

      assert.equal(missingTokens.costStatus, 'missing_tokens');
      assert.equal(missingTokens.estimatedCostUsd, null);
      assert.equal(missingTokens.inputCostUsd, null);
      assert.equal(missingTokens.outputCostUsd, null);
    });

    it('returns explicit unknown_pricing status and null cost for unrecognized models without inventing prices', () => {
      const unknownModel = calculateRequestCost('unsupported-custom-llm', {
        inputTokens: 1000,
        outputTokens: 500,
        tokenCountsAvailable: true,
      });

      assert.equal(unknownModel.costStatus, 'unknown_pricing');
      assert.equal(unknownModel.estimatedCostUsd, null);
    });

    it('computes overview metrics, cost averages, sample counts, and coverage rate consistently', () => {
      const records = [
        // 1. Priced successful request ($0.01)
        {
          timestamp: '2026-10-20T10:00:00Z',
          outcome: 'success',
          durationMs: 200,
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, tokenCountsAvailable: true },
          estimatedCost: 0.01,
          costStatus: 'estimated',
        },
        // 2. Priced successful request ($0.03)
        {
          timestamp: '2026-10-20T10:05:00Z',
          outcome: 'success',
          durationMs: 400,
          tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, tokenCountsAvailable: true },
          estimatedCost: 0.03,
          costStatus: 'estimated',
        },
        // 3. Failed request without tokens (duration 1000ms, unpriced)
        {
          timestamp: '2026-10-20T10:10:00Z',
          outcome: 'failure',
          durationMs: 1000,
          tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null, tokenCountsAvailable: false },
          estimatedCost: null,
          costStatus: 'missing_tokens',
        },
        // 4. Request with unknown model pricing (duration 300ms, unpriced)
        {
          timestamp: '2026-10-20T10:15:00Z',
          outcome: 'success',
          durationMs: 300,
          tokenUsage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, tokenCountsAvailable: true },
          estimatedCost: null,
          costStatus: 'unknown_pricing',
        },
      ];

      const metrics = calculateOverviewMetrics(records);

      assert.equal(metrics.totalRequests, 4);
      assert.equal(metrics.successCount, 3);
      assert.equal(metrics.failureCount, 1);
      assert.equal(metrics.recordsWithMissingTokens, 1);

      // Cost metrics:
      // Total cost = 0.01 + 0.03 = 0.04 USD
      // Priced count = 2 (unpriced/missing requests do NOT dilute the average cost denominator)
      // Unpriced count = 2
      // Average cost = 0.04 / 2 = 0.02 USD
      assert.equal(metrics.totalCostUsd, 0.04);
      assert.equal(metrics.pricedRequestCount, 2);
      assert.equal(metrics.unpricedRequestCount, 2);
      assert.equal(metrics.avgCostPerRequestUsd, 0.02);
      assert.equal(metrics.costCoverageRate, 50.0);

      // Latency metrics:
      // All 4 requests have valid durationMs (including failure at 1000ms):
      // sum = 200 + 400 + 1000 + 300 = 1900 ms / 4 = 475 ms
      assert.equal(metrics.latencySampleCount, 4);
      assert.equal(metrics.avgLatencyMs, 475);
    });

    it('returns zero averages safely when no records exist without division by zero', () => {
      const emptyMetrics = calculateOverviewMetrics([]);
      assert.equal(emptyMetrics.totalRequests, 0);
      assert.equal(emptyMetrics.totalCostUsd, 0);
      assert.equal(emptyMetrics.pricedRequestCount, 0);
      assert.equal(emptyMetrics.avgCostPerRequestUsd, null);
      assert.equal(emptyMetrics.costCoverageRate, 0);
      assert.equal(emptyMetrics.avgLatencyMs, 0);
      assert.equal(emptyMetrics.latencySampleCount, 0);
    });
  });
});
