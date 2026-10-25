import assert from 'node:assert/strict';
import { test } from 'node:test';
import expenseAgentRouter from '../../server/src/features/expenseAgent/expenseAgent.routes.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';
import { setExpenseClientFactoryForTests } from '../../server/src/features/expenses/expenses.service.js';
import { setGeminiExpenseAgentClientFactoryForTests } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';

function dispatch(router, { method = 'POST', path = '/search', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url: path, originalUrl: path, headers, body, query: {}, params: {} };
    const res = {
      locals: {}, headersSent: false, statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.headersSent = true; resolve({ status: this.statusCode, payload }); },
    };
    router.handle(req, res, (error) => error ? errorHandler(error, req, res, reject) : resolve({ status: res.statusCode }));
  });
}

test('POST /api/expense-agent/search completes auth → Gemini tool call → RLS query → function response', { concurrency: false }, async (t) => {
  const queryCalls = [];
  const transactionRow = {
    id: 'tx-a', user_id: 'user-a', type: 'expense', amount: 45000,
    transaction_date: '2026-10-24', category: 'Food', merchant: 'Highlands', note: '', items: [],
    created_at: '2026-10-24T08:00:00.000Z', updated_at: '2026-10-24T08:00:00.000Z',
  };
  const query = {
    select(...args) { queryCalls.push(['select', ...args]); return this; },
    eq(...args) { queryCalls.push(['eq', ...args]); return this; },
    gte(...args) { queryCalls.push(['gte', ...args]); return this; },
    lte(...args) { queryCalls.push(['lte', ...args]); return this; },
    or(...args) { queryCalls.push(['or', ...args]); return this; },
    order(...args) { queryCalls.push(['order', ...args]); return this; },
    range(...args) { queryCalls.push(['range', ...args]); return Promise.resolve({ data: [transactionRow], count: 1, error: null }); },
  };
  const geminiRequests = [];
  setTokenVerifierForTests(async (token) => token === 'valid-token' ? { id: 'user-a', app_metadata: { role: 'user' } } : null);
  setExpenseClientFactoryForTests(() => ({ from: () => query }));
  setGeminiExpenseAgentClientFactoryForTests(() => ({ models: { generateContent: async (request) => {
    geminiRequests.push(request);
    if (geminiRequests.length === 1) return {
      functionCalls: [{ name: 'search_transactions', args: { type: 'expense', merchant: 'Highlands', from: '2026-10-24', to: '2026-10-24' } }],
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'search_transactions', args: {} } }] } }],
    };
    return { text: 'Yesterday you spent 45,000 VND at Highlands.' };
  } } }));
  t.after(() => {
    setTokenVerifierForTests(null);
    setExpenseClientFactoryForTests(null);
    setGeminiExpenseAgentClientFactoryForTests(null);
  });

  const response = await dispatch(expenseAgentRouter, {
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: { message: 'What did I spend at Highlands yesterday?' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.toolName, 'search_transactions');
  assert.equal(response.payload.toolResult.total, 1);
  assert.equal(response.payload.answer, 'Yesterday you spent 45,000 VND at Highlands.');
  assert.ok(queryCalls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a'));
  assert.ok(queryCalls.some((call) => call[0] === 'order' && call[1] === 'transaction_date' && call[2].ascending === false));
  assert.equal(geminiRequests[1].contents[2].parts[0].functionResponse.name, 'search_transactions');
});

test('POST /api/expense-agent/assistant renders a create proposal but does not persist it', { concurrency: false }, async (t) => {
  setTokenVerifierForTests(async (token) => token === 'valid-token' ? { id: 'user-a', app_metadata: { role: 'user' } } : null);
  const requests = [];
  setGeminiExpenseAgentClientFactoryForTests(() => ({ models: { generateContent: async (request) => {
    requests.push(request);
    if (requests.length === 1) return {
      functionCalls: [{ name: 'create_transaction', args: { type: 'expense', amount: 45000, date: '2026-10-25', category: 'Food & dining', merchant: 'Highlands', note: '', items: [] } }],
      candidates: [{ content: { role: 'model', parts: [] } }],
    };
    return { text: 'Please review and confirm the transaction.' };
  } } }));
  t.after(() => { setTokenVerifierForTests(null); setGeminiExpenseAgentClientFactoryForTests(null); });

  const response = await dispatch(expenseAgentRouter, {
    path: '/assistant', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: { message: 'Bought Highlands 45k today', history: [{ role: 'user', text: 'I want to add an expense.' }] },
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.toolName, 'create_transaction');
  assert.equal(response.payload.toolResult.proposal.transaction.amount, 45000);
  assert.equal(requests[0].config.tools[0].functionDeclarations.length, 3);
  assert.match(requests[0].contents, /Conversation context/);
});
