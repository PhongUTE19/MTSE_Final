import assert from 'node:assert/strict';
import { test } from 'node:test';
import expenseAgentRouter from '../../server/src/features/expenseAgent/expenseAgent.routes.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';
import { setExpenseClientFactoryForTests } from '../../server/src/features/expenses/expenses.service.js';
import { setGeminiExpenseAgentClientFactoryForTests } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';

function dispatch(body, headers = { authorization: 'Bearer valid-token' }) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', url: '/summary', originalUrl: '/summary', headers, body, query: {}, params: {} };
    const res = { locals: {}, headersSent: false, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.headersSent = true; resolve({ status: this.statusCode, payload }); } };
    expenseAgentRouter.handle(req, res, (error) => error ? errorHandler(error, req, res, reject) : resolve({ status: res.statusCode }));
  });
}

test('POST /api/expense-agent/summary completes auth → Gemini → full summary query → function response', { concurrency: false }, async (t) => {
  const queryCalls = [];
  const rows = [{ type: 'income', amount: 5000000, category: 'Salary' }, { type: 'expense', amount: 120000, category: 'Food' }];
  setTokenVerifierForTests(async (token) => token === 'valid-token' ? { id: 'user-a', app_metadata: { role: 'user' } } : null);
  setExpenseClientFactoryForTests(() => ({ from: () => {
    const query = {
      select() { return this; }, eq(...args) { queryCalls.push(['eq', ...args]); return this; }, gte() { return this; }, lte() { return this; }, order() { return this; },
      range() { return Promise.resolve({ data: rows, count: rows.length, error: null }); },
    };
    return query;
  } }));
  const requests = [];
  setGeminiExpenseAgentClientFactoryForTests(() => ({ models: { generateContent: async (request) => {
    requests.push(request);
    if (requests.length === 1) return { functionCalls: [{ name: 'get_spending_summary', args: { from: '2026-10-01', to: '2026-10-31' } }], candidates: [{ content: { role: 'model', parts: [] } }] };
    return { text: 'Tháng 10 bạn thu 5.000.000 VND và chi 120.000 VND.' };
  } } }));
  t.after(() => { setTokenVerifierForTests(null); setExpenseClientFactoryForTests(null); setGeminiExpenseAgentClientFactoryForTests(null); });

  const response = await dispatch({ message: 'Tổng thu chi tháng 10 của tôi?' });
  assert.equal(response.status, 200);
  assert.equal(response.payload.toolName, 'get_spending_summary');
  assert.equal(response.payload.toolResult.balance, 4880000);
  assert.deepEqual(response.payload.toolResult.topCategories, [{ category: 'Food', amount: 120000 }]);
  assert.ok(queryCalls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a'));
  assert.equal(requests[1].contents[2].parts[0].functionResponse.name, 'get_spending_summary');
});
