import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  receiptSchema,
  transactionQuerySchema,
  transactionSchema,
} from '../../server/src/features/expenses/expenses.schemas.js';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
  setExpenseClientFactoryForTests,
} from '../../server/src/features/expenses/expenses.service.js';

const validTransaction = {
  type: 'expense',
  amount: 120000,
  date: '2026-10-21',
  category: 'Food & dining',
  merchant: 'Test cafe',
  note: 'Test receipt',
  items: [{ name: 'Coffee', amount: 120000 }],
};

const testUser = { id: 'user-a', token: 'verified-token' };
const row = { id: 'txn-a', user_id: 'user-a', type: 'expense', amount: 120000, transaction_date: '2026-10-21', category: 'Food & dining', merchant: 'Test cafe', note: 'Test receipt', items: [{ name: 'Coffee', amount: 120000 }], created_at: '2026-10-21T00:00:00.000Z', updated_at: '2026-10-21T00:00:00.000Z' };

function mockClient(result = { data: row, count: 1, error: null }) {
  const calls = [];
  const query = {
    select: (...args) => { calls.push(['select', ...args]); return query; },
    eq: (...args) => { calls.push(['eq', ...args]); return query; },
    gte: (...args) => { calls.push(['gte', ...args]); return query; },
    lte: (...args) => { calls.push(['lte', ...args]); return query; },
    or: (...args) => { calls.push(['or', ...args]); return query; },
    order: (...args) => { calls.push(['order', ...args]); return query; },
    range: (...args) => { calls.push(['range', ...args]); return Promise.resolve(result); },
    insert: (...args) => { calls.push(['insert', ...args]); return query; },
    update: (...args) => { calls.push(['update', ...args]); return query; },
    delete: () => { calls.push(['delete']); return query; },
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return { client: { from: (table) => { calls.push(['from', table]); return query; } }, calls };
}

after(() => setExpenseClientFactoryForTests(null));

describe('Expense tracker schema and service', () => {
  it('accepts a valid transaction and rejects a zero amount', () => {
    assert.equal(transactionSchema.parse(validTransaction).amount, 120000);
    assert.throws(() => transactionSchema.parse({ ...validTransaction, amount: 0 }));
  });

  it('validates receipt type, size, and paginated query defaults', () => {
    assert.equal(receiptSchema.parse({ filename: 'receipt.png', mimeType: 'image/png', size: 100 }).filename, 'receipt.png');
    assert.throws(() => receiptSchema.parse({ filename: 'receipt.pdf', mimeType: 'application/pdf', size: 100 }));
    assert.deepEqual(transactionQuerySchema.parse({ page: '2' }), {
      search: '', page: 2, pageSize: 10, sortBy: 'date', sortOrder: 'desc',
    });
  });

  it('uses an RLS-aware client with an explicit owner predicate and preserves public fields', async () => {
    const { client, calls } = mockClient({ data: [row], count: 1, error: null });
    setExpenseClientFactoryForTests(() => client);
    const searchResult = await listTransactions(testUser, {
      search: 'cafe', type: 'expense', category: 'Food & dining',
      from: '2026-10-01', to: '2026-10-31', minAmount: 100000, maxAmount: 150000, page: 1, pageSize: 10,
      sortBy: 'date', sortOrder: 'desc',
    });
    assert.equal(searchResult.total, 1);
    assert.equal(searchResult.transactions[0].date, '2026-10-21');
    assert.deepEqual(calls.find((call) => call[0] === 'eq'), ['eq', 'user_id', 'user-a']);
    assert.deepEqual(calls.find((call) => call[0] === 'order'), ['order', 'transaction_date', { ascending: false }]);
    assert.ok(calls.some((call) => call[0] === 'gte' && call[1] === 'amount' && call[2] === 100000));
    assert.ok(calls.some((call) => call[0] === 'lte' && call[1] === 'amount' && call[2] === 150000));
  });

  it('maps create/update/delete to transaction_date and reports non-owned records as 404', async () => {
    let mock = mockClient({ data: row, count: 1, error: null });
    setExpenseClientFactoryForTests(() => mock.client);
    const created = await createTransaction(testUser, validTransaction);
    assert.equal(created.merchant, 'Test cafe');
    assert.deepEqual(mock.calls.find((call) => call[0] === 'insert')[1].user_id, 'user-a');
    assert.equal(mock.calls.find((call) => call[0] === 'insert')[1].transaction_date, '2026-10-21');

    mock = mockClient({ data: { ...row, amount: 150000 }, count: 1, error: null });
    setExpenseClientFactoryForTests(() => mock.client);
    const updated = await updateTransaction(testUser, row.id, { ...validTransaction, amount: 150000 });
    assert.equal(updated.amount, 150000);

    mock = mockClient({ data: null, count: 0, error: null });
    setExpenseClientFactoryForTests(() => mock.client);
    await assert.rejects(() => getTransaction(testUser, 'belongs-to-user-b'), { statusCode: 404 });
    await assert.rejects(() => deleteTransaction(testUser, 'belongs-to-user-b'), { statusCode: 404 });
  });

  it('blocks deletion of a transaction linked to a confirmed receipt', async () => {
    const { client } = mockClient({ data: null, count: 0, error: { code: '23503', message: 'foreign key violation' } });
    setExpenseClientFactoryForTests(() => client);
    await assert.rejects(
      () => deleteTransaction(testUser, row.id),
      { statusCode: 409, message: 'This transaction is linked to a receipt and cannot be deleted.' },
    );
  });
});
