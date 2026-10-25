import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { getRecentUsageRecords, getUsageStore } from '../../server/src/features/analytics/index.js';
import { searchTransactionsArgsSchema } from '../../server/src/features/expenseAgent/expenseAgent.schemas.js';
import { searchTransactionsForUser } from '../../server/src/features/expenseAgent/expenseAgent.service.js';
import { getVietnamDate, runGeminiExpenseAgent, setGeminiExpenseAgentClientFactoryForTests } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';
import { setAIClientForTests } from '../../server/src/shared/integrations/ai/index.js';

const user = { id: 'user-a', token: 'verified-token' };

describe('Expense Agent search_transactions', () => {
  it('uses the Vietnam calendar date instead of the server UTC date for relative filters', () => {
    // 19:30 UTC on 24/10 is already 02:30 on 25/10 in Ho Chi Minh City.
    assert.equal(getVietnamDate(new Date('2026-10-24T19:30:00.000Z')), '2026-10-25');
  });

  it('validates each supported filter and rejects invalid ranges', () => {
    const parsed = searchTransactionsArgsSchema.parse({
      merchant: 'Highlands', category: 'Food', type: 'expense',
      from: '2026-10-01', to: '2026-10-31', minAmount: 20000, maxAmount: 100000,
      page: 2, pageSize: 5,
    });
    assert.equal(parsed.merchant, 'Highlands');
    assert.equal(parsed.maxAmount, 100000);
    assert.throws(() => searchTransactionsArgsSchema.parse({ from: '2026-11-01', to: '2026-10-01' }));
    assert.throws(() => searchTransactionsArgsSchema.parse({ minAmount: 100, maxAmount: 10 }));
    assert.throws(() => searchTransactionsArgsSchema.parse({ type: 'transfer' }));
  });

  it('combines filters, keeps newest-first pagination, and returns an empty result unchanged', async () => {
    let capturedQuery;
    const result = await searchTransactionsForUser(user, 'dummy', {
      agentRunner: async (_message, executeTool) => ({ answer: 'No transactions found.', toolResult: await executeTool('search_transactions', {
        merchant: 'Highlands', category: 'Food', type: 'expense', from: '2026-10-01', to: '2026-10-31', minAmount: 20000, maxAmount: 100000, page: 2, pageSize: 5,
      }) }),
      listTransactions: async (_user, query) => { capturedQuery = query; return { transactions: [], total: 0, page: 2, pageSize: 5 }; },
    });
    assert.deepEqual(result.toolResult.transactions, []);
    assert.equal(capturedQuery.search, 'Highlands');
    assert.equal(capturedQuery.sortOrder, 'desc');
    assert.equal(capturedQuery.maxAmount, 100000);
  });

  it('rejects unknown tools and model arguments before accessing Supabase', async () => {
    let databaseCalled = false;
    await assert.rejects(() => searchTransactionsForUser(user, 'dummy', {
      agentRunner: (_message, executeTool) => executeTool('delete_transactions', {}),
      listTransactions: async () => { databaseCalled = true; },
    }), { statusCode: 400 });
    assert.equal(databaseCalled, false);

    await assert.rejects(() => searchTransactionsForUser(user, 'dummy', {
      agentRunner: (_message, executeTool) => executeTool('search_transactions', { from: 'not-a-date' }),
      listTransactions: async () => { databaseCalled = true; },
    }), { statusCode: 400 });
    assert.equal(databaseCalled, false);
  });

  it('performs real Gemini function-call protocol for a resolved relative date then sends the tool result back', async () => {
    const calls = [];
    const fakeAi = { models: { generateContent: async (request) => {
      calls.push(request);
      if (calls.length === 1) return {
        functionCalls: [{ name: 'search_transactions', args: { type: 'expense', from: '2026-10-24', to: '2026-10-24' } }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_transactions', args: {} } }] } }],
      };
      return { text: 'You have 1 expense in October.' };
    } } };
    const output = await runGeminiExpenseAgent('Hôm qua tôi tiêu gì?', async (name, args) => {
      assert.equal(name, 'search_transactions');
      assert.equal(args.type, 'expense');
      assert.equal(args.from, '2026-10-24');
      return { transactions: [], total: 0 };
    }, { ai: fakeAi, today: '2026-10-25' });
    assert.equal(output.answer, 'You have 1 expense in October.');
    assert.equal(calls[0].config.tools[0].functionDeclarations[0].name, 'search_transactions');
    assert.match(calls[0].config.systemInstruction, /hôm qua.*previous calendar day/i);
    assert.equal(calls[1].contents[2].parts[0].functionResponse.name, 'search_transactions');
  });

  it('returns Gemini clarification for an ambiguous date and safely maps Gemini failures', async () => {
    const clarificationAi = { models: { generateContent: async () => ({ text: 'Which day of which month would you like?' }) } };
    const clarification = await runGeminiExpenseAgent('gần đây tôi tiêu gì?', async () => assert.fail('Tool must not execute'), { ai: clarificationAi });
    assert.equal(clarification.toolName, null);

    await assert.rejects(() => searchTransactionsForUser(user, 'dummy', {
      agentRunner: async () => { throw new Error('provider secret'); },
    }), { statusCode: 500, message: 'Expense search is temporarily unavailable.' });

    await assert.rejects(() => searchTransactionsForUser(user, 'dummy', {
      agentRunner: (_message, executeTool) => executeTool('search_transactions', {}),
      listTransactions: async () => { throw new Error('Supabase connection failed'); },
    }), { statusCode: 500, message: 'Expense search is temporarily unavailable.' });
  });

  it('stops a slow Gemini request at the configured timeout', async () => {
    const slowAi = { models: { generateContent: () => new Promise(() => {}) } };
    await assert.rejects(
      () => runGeminiExpenseAgent('find transactions', async () => ({}), { ai: slowAi, timeoutMs: 1 }),
      (error) => error.name === 'AIResponseTimeoutError',
    );
  });

  it('records complete AI telemetry for multi-step tool execution without double counting', async () => {
    const geminiCalls = [];
    const fakeAi = {
      models: {
        generateContent: async (request) => {
          geminiCalls.push(request);
          if (geminiCalls.length === 1) {
            return {
              functionCalls: [{ name: 'search_transactions', args: { type: 'expense', from: '2026-10-01', to: '2026-10-31' } }],
              candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_transactions', args: {} } }] } }],
              usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 18, totalTokenCount: 60 },
            };
          }
          return {
            text: 'Total spending in October is 150,000 VND.',
            usageMetadata: { promptTokenCount: 85, candidatesTokenCount: 22, totalTokenCount: 107 },
          };
        },
      },
    };

    const output = await runGeminiExpenseAgent('What did I spend in October?', async (name, args) => {
      assert.equal(name, 'search_transactions');
      return { transactions: [{ amount: 150000 }], total: 1 };
    }, { ai: fakeAi, today: '2026-10-25' });

    assert.equal(output.answer, 'Total spending in October is 150,000 VND.');
    assert.equal(output.toolName, 'search_transactions');

    const recentRecords = getRecentUsageRecords(10).filter((r) => r.feature === 'expense_agent');
    assert.ok(recentRecords.length >= 2, 'Expected at least 2 usage records for 2 LLM steps');

    const summaryRecord = recentRecords[recentRecords.length - 1];
    const selectionRecord = recentRecords[recentRecords.length - 2];

    assert.equal(selectionRecord.operation, 'expenseAgent.toolSelection');
    assert.equal(selectionRecord.outcome, 'success');
    assert.deepEqual(selectionRecord.toolsExecuted, []);
    assert.equal(selectionRecord.tokenUsage.inputTokens, 42);
    assert.equal(selectionRecord.tokenUsage.outputTokens, 18);
    assert.equal(selectionRecord.tokenUsage.totalTokens, 60);

    assert.equal(summaryRecord.operation, 'expenseAgent.summary');
    assert.equal(summaryRecord.outcome, 'success');
    assert.deepEqual(summaryRecord.toolsExecuted, ['search_transactions']);
    assert.equal(summaryRecord.tokenUsage.inputTokens, 85);
    assert.equal(summaryRecord.tokenUsage.outputTokens, 22);
    assert.equal(summaryRecord.tokenUsage.totalTokens, 107);
  });

  it('records single telemetry record when clarification is returned without executing tools', async () => {
    const clarificationAi = {
      models: {
        generateContent: async () => ({
          text: 'Which day would you like to search?',
          usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 },
        }),
      },
    };

    const startCount = getRecentUsageRecords(50).filter((r) => r.feature === 'expense_agent').length;

    const output = await runGeminiExpenseAgent('help me search', async () => {
      assert.fail('Tool should not be called');
    }, { ai: clarificationAi });

    assert.equal(output.toolName, null);
    assert.equal(output.answer, 'Which day would you like to search?');

    const endRecords = getRecentUsageRecords(50).filter((r) => r.feature === 'expense_agent');
    assert.equal(endRecords.length, startCount + 1, 'Only one record should be created for clarification');

    const latest = endRecords[endRecords.length - 1];
    assert.equal(latest.operation, 'expenseAgent.toolSelection');
    assert.equal(latest.outcome, 'success');
    assert.deepEqual(latest.toolsExecuted, []);
  });

  it('retries transient 503 / 429 errors and records attempt history', async () => {
    let callCount = 0;
    const retryAi = {
      models: {
        generateContent: async () => {
          callCount++;
          if (callCount === 1) {
            const err = new Error('503 Service Unavailable');
            err.status = 503;
            throw err;
          }
          return { text: 'Response after successful retry.' };
        },
      },
    };

    const output = await runGeminiExpenseAgent('find transactions', async () => ({}), {
      ai: retryAi,
      maxRetries: 2,
      initialDelayMs: 1,
    });

    assert.equal(output.answer, 'Response after successful retry.');
    assert.equal(callCount, 2);

    const records = getRecentUsageRecords(50).filter((r) => r.feature === 'expense_agent');
    const latest = records[records.length - 1];
    assert.ok(latest);
    assert.equal(latest.attemptCount, 2);
    assert.equal(latest.attempts[0].status, 'failure');
    assert.equal(latest.attempts[1].status, 'success');
  });

  it('gracefully handles non-fatal telemetry tracking errors without breaking user flow', async () => {
    const ai = {
      models: {
        generateContent: async () => ({ text: 'Safe response.' }),
      },
    };

    const store = getUsageStore();
    const originalAdd = store.add;
    store.add = () => {
      throw new Error('Analytics database write failed');
    };

    try {
      const output = await runGeminiExpenseAgent('find expenses', async () => ({}), { ai });
      assert.equal(output.answer, 'Safe response.');
    } finally {
      store.add = originalAdd;
    }
  });

  it('falls back to shared getAIClient when no clientFactory or options.ai provided', async () => {
    const mockClient = {
      models: {
        generateContent: async () => ({ text: 'Response from shared singleton client.' }),
      },
    };

    setAIClientForTests(mockClient);
    try {
      const output = await runGeminiExpenseAgent('search', async () => ({}));
      assert.equal(output.answer, 'Response from shared singleton client.');
    } finally {
      setAIClientForTests(null);
    }
  });
});

after(() => {
  setGeminiExpenseAgentClientFactoryForTests(null);
  setAIClientForTests(null);
});
