import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from '../../server/node_modules/express/index.js';
import expenseRouter from '../../server/src/features/expenses/expenses.routes.js';
import expenseAgentRouter from '../../server/src/features/expenseAgent/expenseAgent.routes.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import {
  setTokenVerifierForTests,
  authenticate,
} from '../../server/src/shared/middleware/authenticate.js';
import { authorize } from '../../server/src/shared/middleware/authorize.js';
import { setExpenseClientFactoryForTests } from '../../server/src/features/expenses/expenses.service.js';
import { setReceiptDependenciesForTests } from '../../server/src/features/expenses/receipt.service.js';

function dispatch(router, { method = 'GET', path, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = { method, url: path, originalUrl: path, headers, body, query: {}, params: {} };
    const response = {
      headersSent: false,
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.headersSent = true; resolve({ status: this.statusCode, payload }); },
      end() { this.headersSent = true; resolve({ status: this.statusCode }); },
    };
    router.handle(req, response, (error) => {
      if (!error) return resolve({ status: response.statusCode });
      errorHandler(error, req, response, reject);
    });
  });
}

function ownerAwareClient() {
  const state = {};
  const query = {
    select() { return this; },
    update() { return this; },
    delete() { return this; },
    eq(column, value) { state[column] = value; return this; },
    maybeSingle: async () => ({
      data: state.id === 'transaction-a' && state.user_id === 'user-a'
        ? {
            id: 'transaction-a',
            user_id: 'user-a',
            amount: 12.5,
            category: 'Food',
            transaction_date: '2026-10-23',
            note: null,
            created_at: '2026-10-23T00:00:00.000Z',
            updated_at: '2026-10-23T00:00:00.000Z',
          }
        : null,
      error: null,
    }),
  };

  return { from: () => ({ ...query }) };
}

function receiptClientWithoutLinkedTransaction() {
  const query = {
    select() { return this; },
    eq() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return { from: () => query };
}

test('expense routes reject unauthenticated transaction and receipt-draft requests', { concurrency: false }, async (t) => {
  setTokenVerifierForTests(async () => null);
  t.after(() => {
    setTokenVerifierForTests(null);
  });

  const transactionResponse = await dispatch(expenseRouter, { path: '/transactions' });
  const receiptResponse = await dispatch(expenseRouter, {
    method: 'POST',
    path: '/receipts/upload',
    headers: { 'content-type': 'application/json' },
    body: { fileName: 'receipt.png', fileType: 'image/png' },
  });
  const agentResponse = await dispatch(expenseAgentRouter, {
    method: 'POST', path: '/search', body: { message: 'Find Highlands transaction' },
  });
  const summaryResponse = await dispatch(expenseAgentRouter, {
    method: 'POST', path: '/summary', body: { message: 'Total spending this month' },
  });

  assert.equal(transactionResponse.status, 401);
  assert.equal(receiptResponse.status, 401);
  assert.equal(agentResponse.status, 401);
  assert.equal(summaryResponse.status, 401);
});

test('expense routes enforce ownership at the HTTP boundary and reject non-admin roles', { concurrency: false }, async (t) => {
  setTokenVerifierForTests(async (token) => {
    if (token === 'user-a-token') return { id: 'user-a', app_metadata: { role: 'user' } };
    if (token === 'user-b-token') return { id: 'user-b', app_metadata: { role: 'user' } };
    return null;
  });
  setExpenseClientFactoryForTests(() => ownerAwareClient());
  // Transaction DELETE checks linked receipts before deleting. Mock this
  // dependency so ownership testing does not call actual Supabase with fake tokens.
  setReceiptDependenciesForTests({
    clientFactory: { user: () => receiptClientWithoutLinkedTransaction(), server: () => null },
  });
  const adminRouter = express.Router();
  adminRouter.get('/admin-check', authenticate, authorize('admin'), (_req, res) => res.status(204).end());
  const headers = { authorization: 'Bearer user-b-token', 'content-type': 'application/json' };
  t.after(() => {
    setTokenVerifierForTests(null);
    setExpenseClientFactoryForTests(null);
    setReceiptDependenciesForTests();
  });

  const getResponse = await dispatch(expenseRouter, { path: '/transactions/transaction-a', headers });
  const updateResponse = await dispatch(expenseRouter, {
    method: 'PUT',
    path: '/transactions/transaction-a',
    headers,
    body: {
      type: 'expense',
      amount: 13,
      category: 'Food',
      merchant: 'Corner shop',
      date: '2026-10-23',
      note: '',
      items: [],
    },
  });
  const deleteResponse = await dispatch(expenseRouter, { method: 'DELETE', path: '/transactions/transaction-a', headers });
  const roleResponse = await dispatch(adminRouter, { path: '/admin-check', headers });

  assert.equal(getResponse.status, 404);
  assert.equal(updateResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
  assert.equal(roleResponse.status, 403);
});
