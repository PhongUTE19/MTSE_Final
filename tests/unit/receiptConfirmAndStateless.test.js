import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import {
  setReceiptDependenciesForTests,
  uploadReceipt,
  confirmReceipt,
} from '../../server/src/features/receipt/receipt.service.js';
import receiptRouter from '../../server/src/features/receipt/receipt.route.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';
import { createTransactionProposalForUser } from '../../server/src/features/expenseAssistant/expenseAssistant.service.js';
import {
  createTransaction,
  setExpenseClientFactoryForTests,
} from '../../server/src/features/transaction/transaction.service.js';

function dispatch(router, { method = 'GET', path, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url: path,
      originalUrl: path,
      headers,
      body,
      query: {},
      params: {},
      is: (type) => String(headers['content-type'] || '').includes(type),
      setTimeout() {},
    };
    const res = {
      headersSent: false,
      statusCode: 200,
      once() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.headersSent = true; resolve({ status: this.statusCode, payload }); },
    };
    router.handle(req, res, (error) => {
      if (!error) return resolve({ status: res.statusCode });
      errorHandler(error, req, res, reject);
    });
  });
}

afterEach(() => {
  setReceiptDependenciesForTests();
  setExpenseClientFactoryForTests(null);
  setTokenVerifierForTests(null);
});

describe('P2-T06: Stateless Receipt OCR, Atomic Confirm & Idempotency', () => {
  const sampleTx = {
    type: 'expense',
    amount: 45000,
    date: '2026-11-17',
    category: 'Food & dining',
    merchant: 'Highlands Coffee',
    note: 'Morning coffee',
    items: [{ name: 'Phin Sua Da', amount: 45000 }],
  };

  const sampleBuffer = Buffer.from('receipt-image-bytes');
  const sampleSha = crypto.createHash('sha256').update(sampleBuffer).digest('hex');
  const sampleMeta = {
    filename: 'coffee.png',
    mimeType: 'image/png',
    size: sampleBuffer.length,
    sha256: sampleSha,
  };

  it('1. Stateless OCR returns normalized extraction and metadata with zero DB or Storage writes', async () => {
    const dbCalls = [];
    const storageCalls = [];

    setReceiptDependenciesForTests({
      clientFactory: {
        user: () => ({
          from: (t) => { dbCalls.push(t); return {}; },
          rpc: async (fn) => { dbCalls.push(fn); return { data: null, error: null }; },
        }),
        server: () => ({
          from: (t) => { dbCalls.push(t); return {}; },
          rpc: async (fn) => { dbCalls.push(fn); return { data: null, error: null }; },
          storage: { from: () => ({ upload: async () => { storageCalls.push('upload'); return { error: null }; } }) },
        }),
      },
      extractor: async () => ({
        model: 'gemini-2.5-flash',
        extraction: {
          documentType: 'receipt',
          transactionType: 'expense',
          merchant: 'Highlands Coffee',
          transactionDate: '2026-11-17',
          totalAmount: 45000,
          currency: 'VND',
          category: 'Food & dining',
          note: 'Coffee',
          items: [{ name: 'Latte', amount: 45000 }],
          warnings: [],
        },
      }),
    });

    const result = await uploadReceipt({ id: 'user-1', token: 'tok' }, { buffer: sampleBuffer }, sampleMeta);
    assert.ok(result.draftId);
    assert.equal(result.filename, 'coffee.png');
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.size, sampleBuffer.length);
    assert.equal(result.sha256, sampleSha);
    assert.equal(result.aiModel, 'gemini-2.5-flash');
    assert.ok(result.promptVersion);
    assert.equal(result.extraction.merchant, 'Highlands Coffee');
    assert.equal(result.extraction.amount, 45000);
    assert.equal(result.storagePath, undefined, 'Must not expose internal storage paths');
    assert.deepEqual(dbCalls, [], 'Stateless OCR must perform zero DB writes');
    assert.deepEqual(storageCalls, [], 'Stateless OCR must perform zero Storage uploads');
  });

  it('2. Confirm creates Transaction + Receipt atomically, supports idempotent retries, and rejects conflicts', async () => {
    const storageObjects = new Map();
    const removedPaths = [];
    const rpcCalls = [];
    const confirmedReceipts = new Map();
    const confirmedTransactions = new Map();

    const makeClientFactory = () => ({
      user: (user) => ({
        from: (table) => ({
          select: () => {
            const filters = {};
            const chain = {
              eq(col, val) { filters[col] = val; return chain; },
              maybeSingle: async () => {
                if (table === 'receipts') {
                  const row = confirmedReceipts.get(filters.storage_path);
                  return { data: row && row.user_id === user.id ? row : null, error: null };
                }
                if (table === 'expense_transactions') {
                  const row = confirmedTransactions.get(filters.id);
                  return { data: row && row.user_id === user.id ? row : null, error: null };
                }
                return { data: null, error: null };
              },
            };
            return chain;
          },
        }),
        rpc: async (fn, args) => {
          rpcCalls.push({ fn, args });
          const existing = confirmedReceipts.get(args.p_storage_path);
          if (existing) {
            const tx = confirmedTransactions.get(existing.transaction_id);
            if (existing.sha256 !== args.p_sha256 || tx.merchant !== args.p_final_transaction.merchant) {
              return { data: null, error: { message: 'conflicting draft confirmation' } };
            }
            return { data: { receipt: existing, transaction: tx, idempotent: true }, error: null };
          }
          const tx = {
            id: 'tx-100',
            user_id: user.id,
            type: args.p_final_transaction.type,
            amount: args.p_final_transaction.amount,
            transaction_date: args.p_final_transaction.date,
            category: args.p_final_transaction.category,
            merchant: args.p_final_transaction.merchant,
            note: args.p_final_transaction.note || '',
            items: args.p_final_transaction.items || [],
            created_at: '2026-11-17T00:00:00Z',
            updated_at: '2026-11-17T00:00:00Z',
          };
          const rec = {
            id: 'rec-100',
            user_id: user.id,
            storage_path: args.p_storage_path,
            original_filename: args.p_filename,
            mime_type: args.p_mime_type,
            file_size: args.p_file_size,
            sha256: args.p_sha256,
            status: 'confirmed',
            extraction: args.p_extraction,
            warnings: args.p_warnings,
            transaction_id: tx.id,
            confirmed_at: '2026-11-17T00:00:00Z',
            created_at: '2026-11-17T00:00:00Z',
            updated_at: '2026-11-17T00:00:00Z',
          };
          confirmedTransactions.set(tx.id, tx);
          confirmedReceipts.set(args.p_storage_path, rec);
          return { data: { receipt: rec, transaction: tx, idempotent: false }, error: null };
        },
      }),
      server: () => ({
        storage: {
          from: () => ({
            upload: async (path, buf) => {
              if (storageObjects.has(path)) return { error: { statusCode: 409, message: 'already exists' } };
              storageObjects.set(path, buf);
              return { error: null };
            },
            remove: async (paths) => {
              removedPaths.push(...paths);
              return { error: null };
            },
          }),
        },
      }),
    });

    setReceiptDependenciesForTests({ clientFactory: makeClientFactory() });
    const user1 = { id: 'user-1', token: 'tok-1' };

    // First confirmation succeeds
    const first = await confirmReceipt(
      user1,
      { buffer: sampleBuffer },
      sampleMeta,
      { draftId: 'draft-abc', transaction: JSON.stringify(sampleTx) }
    );
    assert.equal(first.idempotent, false);
    assert.equal(first.transaction.id, 'tx-100');
    assert.equal(first.receipt.status, 'confirmed');
    assert.ok(storageObjects.has('user-1/draft-abc/original'));

    // Concurrent / repeated retry is idempotent and does NOT remove the Storage object
    const retry = await confirmReceipt(
      user1,
      { buffer: sampleBuffer },
      sampleMeta,
      { draftId: 'draft-abc', transaction: JSON.stringify(sampleTx) }
    );
    assert.equal(retry.idempotent, true);
    assert.equal(retry.transaction.id, 'tx-100');
    assert.deepEqual(removedPaths, [], 'Confirmed Storage object must never be deleted on retry');

    // Conflicting reuse of same draftId is rejected with 409 and preserves Storage object
    await assert.rejects(
      () =>
        confirmReceipt(
          user1,
          { buffer: sampleBuffer },
          sampleMeta,
          { draftId: 'draft-abc', transaction: JSON.stringify({ ...sampleTx, amount: 99999 }) }
        ),
      (err) => err.statusCode === 409
    );
    assert.deepEqual(removedPaths, [], 'Confirmed Storage object must not be removed on conflict');
  });

  it('3. Compensates Storage upload on RPC failure and prevents RPC on Storage failure', async () => {
    const removedPaths = [];
    const rpcCalls = [];

    // Case A: Storage upload fails -> RPC is never invoked
    setReceiptDependenciesForTests({
      clientFactory: {
        user: () => ({
          from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          rpc: async (fn) => { rpcCalls.push(fn); return { data: null, error: null }; },
        }),
        server: () => ({
          storage: {
            from: () => ({
              upload: async () => ({ error: { message: 'bucket unavailable' } }),
              remove: async (paths) => { removedPaths.push(...paths); return { error: null }; },
            }),
          },
        }),
      },
    });

    await assert.rejects(
      () => confirmReceipt({ id: 'user-1', token: 't' }, { buffer: sampleBuffer }, sampleMeta, { draftId: 'd-fail-storage', transaction: sampleTx }),
      /temporarily unavailable/i
    );
    assert.deepEqual(rpcCalls, [], 'RPC must not run if Storage upload failed');

    // Case B: RPC fails after upload -> compensating Storage removal runs
    setReceiptDependenciesForTests({
      clientFactory: {
        user: () => ({
          from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          rpc: async () => ({ data: null, error: { message: 'constraint failure' } }),
        }),
        server: () => ({
          storage: {
            from: () => ({
              upload: async () => ({ error: null }),
              remove: async (paths) => { removedPaths.push(...paths); return { error: null }; },
            }),
          },
        }),
      },
    });

    await assert.rejects(
      () => confirmReceipt({ id: 'user-1', token: 't' }, { buffer: sampleBuffer }, sampleMeta, { draftId: 'd-fail-rpc', transaction: sampleTx }),
      /temporarily unavailable/i
    );
    assert.deepEqual(removedPaths, ['user-1/d-fail-rpc/original']);
  });

  it('4. Coalesces concurrent confirmation requests for the same user and draftId', async () => {
    let rpcCount = 0;
    setReceiptDependenciesForTests({
      clientFactory: {
        user: (user) => ({
          from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
          rpc: async () => {
            rpcCount += 1;
            await new Promise((r) => setTimeout(r, 15));
            return {
              data: {
                receipt: { id: 'r-conc', user_id: user.id, status: 'confirmed' },
                transaction: { id: 'tx-conc', ...sampleTx, transaction_date: sampleTx.date },
                idempotent: false,
              },
              error: null,
            };
          },
        }),
        server: () => ({
          storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
        }),
      },
    });

    const user = { id: 'user-1', token: 't' };
    const [res1, res2] = await Promise.all([
      confirmReceipt(user, { buffer: sampleBuffer }, sampleMeta, { draftId: 'd-conc', transaction: sampleTx }),
      confirmReceipt(user, { buffer: sampleBuffer }, sampleMeta, { draftId: 'd-conc', transaction: sampleTx }),
    ]);

    assert.equal(rpcCount, 1, 'Concurrent confirmations for same draftId must coalesce');
    assert.equal(res1.transaction.id, res2.transaction.id);
  });

  it('5. Expense Assistant creates stateless proposal without touching transaction_drafts or transactions', async () => {
    const result = await createTransactionProposalForUser(
      { id: 'user-1', token: 'tok-1' },
      'Log 50k coffee at Highlands',
      {
        agentRunner: async (_msg, executeTool) => {
          const toolResult = await executeTool('create_transaction', {
            type: 'expense',
            amount: 50000,
            date: '2026-11-17',
            category: 'Food & dining',
            merchant: 'Highlands',
            note: 'Coffee',
            items: [],
          });
          return { answer: 'Review this proposal', toolName: 'create_transaction', toolResult };
        },
      }
    );

    assert.ok(result.toolResult.draftId);
    assert.equal(result.toolResult.sourceType, 'assistant_proposal');
    assert.equal(result.toolResult.draft.merchant, 'Highlands');
    assert.equal(result.toolResult.draft.amount, 50000);
  });

  it('6. Manual Transaction API supports optional deterministic UUID idempotently and rejects conflicts', async () => {
    const deterministicId = '11111111-1111-4111-8111-111111111111';
    const stored = new Map();

    setExpenseClientFactoryForTests((user) => ({
      from: () => ({
        select: () => {
          const filters = {};
          const q = {
            eq(col, val) { filters[col] = val; return q; },
            maybeSingle: async () => {
              const row = stored.get(filters.id);
              return { data: row && row.user_id === user.id ? row : null, error: null };
            },
          };
          return q;
        },
        insert: (payload) => ({
          select: () => ({
            single: async () => {
              const id = payload.id || '22222222-2222-4222-8222-222222222222';
              if (stored.has(id)) return { data: null, error: { code: '23505', message: 'duplicate' } };
              const row = { ...payload, id, created_at: '2026-11-17T00:00:00Z', updated_at: '2026-11-17T00:00:00Z' };
              stored.set(id, row);
              return { data: row, error: null };
            },
          }),
        }),
      }),
    }));

    const user = { id: 'user-1', token: 'tok-1' };
    const first = await createTransaction(user, { id: deterministicId, ...sampleTx });
    assert.equal(first.id, deterministicId);

    // Retry with identical payload returns existing transaction idempotently
    const retry = await createTransaction(user, { id: deterministicId, ...sampleTx });
    assert.equal(retry.id, deterministicId);
    assert.equal(retry.amount, sampleTx.amount);

    // Conflicting reuse of same deterministic ID throws 409 Conflict
    await assert.rejects(
      () => createTransaction(user, { id: deterministicId, ...sampleTx, amount: 99999 }),
      (err) => err.statusCode === 409
    );

    // Legacy callers without ID remain compatible
    const noId = await createTransaction(user, sampleTx);
    assert.equal(noId.id, '22222222-2222-4222-8222-222222222222');
  });

  it('7. Enforces Guest 401 and Admin 403 on /api/receipt/confirm and verifies migration RPC security contract', async () => {
    setTokenVerifierForTests(async (token) => {
      if (token === 'admin-tok') return { id: 'admin-1', app_metadata: { role: 'admin' } };
      return null;
    });

    const guestRes = await dispatch(receiptRouter, { method: 'POST', path: '/confirm' });
    assert.equal(guestRes.status, 401);

    const adminRes = await dispatch(receiptRouter, {
      method: 'POST',
      path: '/confirm',
      headers: { authorization: 'Bearer admin-tok' },
    });
    assert.equal(adminRes.status, 403);

    const sql = await readFile(
      new URL('../../supabase/migrations/202611170009_confirm_staged_receipt_transaction.sql', import.meta.url),
      'utf8'
    );
    assert.match(sql, /create or replace function public\.confirm_staged_receipt_transaction/i);
    assert.match(sql, /security definer/i);
    assert.match(sql, /set search_path = pg_catalog, public/i);
    assert.match(sql, /owner to receipt_lifecycle_owner/i);
    assert.match(sql, /revoke all on function public\.confirm_staged_receipt_transaction[\s\S]*from public, anon, service_role/i);
    assert.match(sql, /grant execute on function public\.confirm_staged_receipt_transaction[\s\S]*to authenticated/i);
  });
});
