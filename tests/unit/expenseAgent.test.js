import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { searchTransactionsArgsSchema } from '../../server/src/features/expenseAgent/expenseAgent.schemas.js';
import { searchTransactionsForUser } from '../../server/src/features/expenseAgent/expenseAgent.service.js';
import { getVietnamDate, runGeminiExpenseAgent, setGeminiExpenseAgentClientFactoryForTests } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';

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
      agentRunner: async (_message, executeTool) => ({ answer: 'Không có giao dịch.', toolResult: await executeTool('search_transactions', {
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
      return { text: 'Bạn có 1 giao dịch chi trong tháng 10.' };
    } } };
    const output = await runGeminiExpenseAgent('Hôm qua tôi tiêu gì?', async (name, args) => {
      assert.equal(name, 'search_transactions');
      assert.equal(args.type, 'expense');
      assert.equal(args.from, '2026-10-24');
      return { transactions: [], total: 0 };
    }, { ai: fakeAi, today: '2026-10-25' });
    assert.equal(output.answer, 'Bạn có 1 giao dịch chi trong tháng 10.');
    assert.equal(calls[0].config.tools[0].functionDeclarations[0].name, 'search_transactions');
    assert.match(calls[0].config.systemInstruction, /hôm qua.*previous calendar day/i);
    assert.equal(calls[1].contents[2].parts[0].functionResponse.name, 'search_transactions');
  });

  it('returns Gemini clarification for an ambiguous date and safely maps Gemini failures', async () => {
    const clarificationAi = { models: { generateContent: async () => ({ text: 'Bạn muốn ngày nào của tháng nào?' }) } };
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
      () => runGeminiExpenseAgent('tìm giao dịch', async () => ({}), { ai: slowAi, timeoutMs: 1 }),
      (error) => error.name === 'AIResponseTimeoutError',
    );
  });
});

after(() => setGeminiExpenseAgentClientFactoryForTests(null));
