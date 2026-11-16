import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setReceiptDependenciesForTests, uploadReceipt, retryReceipt, confirmReceipt } from '../../server/src/features/receipt/receipt.service.js';
import { AIResponseTimeoutError } from '../../server/src/shared/guardrails/index.js';
import { ReceiptGuardrailError } from '../../server/src/features/receipt/receiptGuardrails.js';

afterEach(() => {
  setReceiptDependenciesForTests();
});

it('keeps privileged extraction transitions server-only in the migration contract', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/202610230002_secure_receipts.sql', import.meta.url), 'utf8');
  assert.match(sql, /server_complete_receipt_extraction/);
  assert.match(sql, /public\.receipt_auth_role\(\) <> 'service_role'/);
  assert.doesNotMatch(sql, /grant execute on function[^;]*server_complete_receipt_extraction[^;]*to authenticated/i);
  assert.match(sql, /server_complete_receipt_extraction\(uuid,uuid,jsonb,jsonb\),public\.server_mark_receipt_failed\(uuid,uuid,text\) to service_role/i);
  assert.doesNotMatch(sql, /values\(v,'pending'/i);
  assert.match(sql, /v_receipt_id uuid:=gen_random_uuid\(\)/);
  assert.match(sql, /v::text\|\|'\/'\|\|v_receipt_id::text\|\|'\/original'/);
  assert.match(sql, /\(p_final_transaction->>'date'\)::date/);
  assert.match(sql, /roles && array\['public','anon','authenticated'\]::name\[\]/);
  assert.match(sql, /attempts >= 5/);
  assert.match(sql, /processing_started_at > now\(\)-interval '10 minutes'/);
  assert.match(sql, /receipt is already processing/);
  assert.match(sql, /receipt is actively processing/);
  assert.match(sql, /grant receipt_lifecycle_owner to postgres/i);
  assert.match(sql, /grant usage, create on schema public to receipt_lifecycle_owner/i);
  assert.match(sql, /revoke create on schema public from receipt_lifecycle_owner/i);
  assert.match(sql, /revoke receipt_lifecycle_owner from postgres/i);
  assert.match(sql, /create function public\.receipt_auth_uid\(\).*security definer.*auth\.uid\(\)/i);
  assert.match(sql, /create function public\.receipt_auth_role\(\).*security definer.*auth\.role\(\)/i);
  assert.match(sql, /revoke all on function public\.receipt_auth_uid\(\), public\.receipt_auth_role\(\) from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.receipt_auth_uid\(\), public\.receipt_auth_role\(\) to receipt_lifecycle_owner/i);
  assert.match(sql, /create policy receipts_lifecycle_owner_update/i);
  assert.match(sql, /create policy expense_transactions_lifecycle_owner_insert/i);
  assert.match(sql, /create policy expense_transactions_lifecycle_owner_delete/i);
  assert.match(sql, /grant select,insert,delete on public\.expense_transactions to receipt_lifecycle_owner/i);
  assert.match(sql, /begin_confirmed_receipt_transaction_delete/i);
  assert.match(sql, /finalize_confirmed_receipt_transaction_delete/i);
  assert.match(sql, /delete from public\.receipts where id=r\.id returning \* into r; delete from public\.expense_transactions/i);
});

it('stateless uploadReceipt performs no DB or Storage writes on extraction failure, timeout, or guardrail rejection', async () => {
  const rpcCalls = [];
  const storageCalls = [];
  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({ rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; } }),
      server: () => ({
        rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; },
        storage: { from: () => ({ upload: async () => { storageCalls.push('upload'); return { error: null }; } }) },
      }),
    },
    extractor: async () => { throw new Error('Gemini unavailable'); },
  });

  await assert.rejects(
    uploadReceipt({ id: 'user-1', token: 'token' }, { buffer: Buffer.from('image') }, { filename: 'receipt.jpg', mimeType: 'image/jpeg', size: 5, sha256: 'b'.repeat(64) }),
    /could not be completed.*try again/i,
  );
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(storageCalls, []);

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({ rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; } }),
      server: () => ({
        rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; },
        storage: { from: () => ({ upload: async () => { storageCalls.push('upload'); return { error: null }; } }) },
      }),
    },
    extractor: async () => { throw new AIResponseTimeoutError('The request timed out while generating a response. Please try again.'); },
  });

  await assert.rejects(
    uploadReceipt({ id: 'user-1', token: 'token' }, { buffer: Buffer.from('image') }, { filename: 'receipt.jpg', mimeType: 'image/jpeg', size: 5, sha256: 'c'.repeat(64) }),
    /Receipt extraction timed out/i,
  );
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(storageCalls, []);

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({ rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; } }),
      server: () => ({
        rpc: async (name) => { rpcCalls.push(name); return { data: null, error: null }; },
        storage: { from: () => ({ upload: async () => { storageCalls.push('upload'); return { error: null }; } }) },
      }),
    },
    extractor: async () => { throw new ReceiptGuardrailError('NOT_A_RECEIPT', 'This image does not appear to be a receipt. No transaction was created.'); },
  });

  await assert.rejects(
    uploadReceipt({ id: 'user-1', token: 'token' }, { buffer: Buffer.from('image') }, { filename: 'photo.jpg', mimeType: 'image/jpeg', size: 5, sha256: 'd'.repeat(64) }),
    /does not appear to be a receipt/,
  );
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(storageCalls, []);
});

it('allows retrying extraction against an existing failed receipt using stored image', async () => {
  const rpcCalls = [];
  const serverRpcCalls = [];
  const failedReceipt = {
    id: 'receipt-failed-1',
    user_id: 'user-1',
    status: 'failed',
    storage_path: 'user-1/receipt-failed-1/original',
    mime_type: 'image/jpeg',
    filename: 'bill.jpg',
    processing_lease_id: 'lease-r',
  };
  const completedReceipt = { ...failedReceipt, status: 'review_required', extraction: { merchant: 'Highlands', totalAmount: 75000 } };

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: failedReceipt, error: null }),
              single: async () => ({ data: failedReceipt, error: null }),
            }),
          }),
        }),
        rpc: async (name) => {
          rpcCalls.push(name);
          if (name === 'retry_receipt_processing') return { data: failedReceipt, error: null };
          if (name === 'start_receipt_processing') return { data: failedReceipt, error: null };
          throw new Error(`Unexpected RPC ${name}`);
        },
      }),
      server: () => ({
        rpc: async (name) => {
          serverRpcCalls.push(name);
          return { data: completedReceipt, error: null };
        },
        storage: {
          from: () => ({
            download: async () => ({
              data: { arrayBuffer: async () => Buffer.from('image-bytes') },
              error: null,
            }),
          }),
        },
      }),
    },
    extractor: async () => ({
      extraction: {
        documentType: 'receipt',
        transactionType: 'expense',
        merchant: 'Highlands',
        transactionDate: '2026-10-24',
        totalAmount: 75000,
        currency: 'VND',
        category: 'Food & dining',
        items: [],
      },
    }),
  });

  const retried = await retryReceipt({ id: 'user-1', token: 'token' }, 'receipt-failed-1');
  assert.equal(retried.id, 'receipt-failed-1');
  assert.deepEqual(rpcCalls, ['retry_receipt_processing', 'start_receipt_processing']);
  assert.deepEqual(serverRpcCalls, ['server_complete_receipt_extraction']);
});

it('keeps financial writes gated strictly behind explicit confirmReceipt', async () => {
  const userRpcCalls = [];
  const finalTransaction = {
    type: 'expense',
    amount: 75000,
    date: '2026-10-24',
    category: 'Food & dining',
    merchant: 'Highlands Coffee',
    note: '',
    items: [],
  };

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          }),
        }),
        rpc: async (name, args) => {
          userRpcCalls.push({ name, args });
          return {
            data: {
              receipt: { id: 'r-1', status: 'confirmed' },
              transaction: { id: 'txn-1', amount: 75000, transaction_date: '2026-10-24', type: 'expense', category: 'Food & dining', merchant: 'Highlands Coffee', note: '', items: [] },
              idempotent: false,
            },
            error: null,
          };
        },
      }),
      server: () => ({
        storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      }),
    },
  });

  const confirmed = await confirmReceipt(
    { id: 'user-1', token: 'token' },
    { buffer: Buffer.from('img') },
    { filename: 'coffee.png', mimeType: 'image/png', size: 3, sha256: 'a'.repeat(64) },
    { draftId: 'draft-1', transaction: finalTransaction }
  );
  assert.equal(confirmed.transaction.id, 'txn-1');
  assert.equal(userRpcCalls.length, 1);
  assert.equal(userRpcCalls[0].name, 'confirm_staged_receipt_transaction');
  assert.deepEqual(userRpcCalls[0].args.p_final_transaction, finalTransaction);
});

it('extractReceiptImage records telemetry and surfaces operational error without crashing on failure', async () => {
  const { extractReceiptImage, setAIClientForTests } = await import('../../server/src/shared/integrations/ai/providers/geminiProvider.js');
  setAIClientForTests({
    models: {
      generateContent: async () => { throw new Error('Simulated upstream failure'); },
    },
  });

  try {
    await assert.rejects(
      () => extractReceiptImage({ buffer: Buffer.from('test'), mimeType: 'image/png' }, { timeoutMs: 500 }),
      /Simulated upstream failure/,
    );
  } finally {
    setAIClientForTests(null);
  }
});

it('rejects malformed Gemini JSON in extractReceiptImage and never invokes confirm_receipt_transaction', async () => {
  const { extractReceiptImage, setAIClientForTests } = await import('../../server/src/shared/integrations/ai/providers/geminiProvider.js');
  const { AIResponseValidationError } = await import('../../server/src/shared/guardrails/index.js');

  setAIClientForTests({
    models: {
      generateContent: async () => ({ text: '{"documentType": "receipt", "totalAmount": ' }),
    },
  });

  const userRpcCalls = [];
  const serverRpcCalls = [];
  const receipt = { id: 'receipt-bad-json', storage_path: 'user-1/receipt-bad-json/original', processing_lease_id: 'lease-bad' };

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({
        rpc: async (name) => {
          userRpcCalls.push(name);
          if (name === 'create_receipt_upload' || name === 'start_receipt_processing') {
            return { data: receipt, error: null };
          }
          throw new Error(`Unexpected user RPC ${name}`);
        },
      }),
      server: () => ({
        rpc: async (name) => {
          serverRpcCalls.push(name);
          return { data: receipt, error: null };
        },
        storage: {
          from: () => ({
            upload: async () => ({ error: null }),
          }),
        },
      }),
    },
    extractor: (image, opts) => extractReceiptImage(image, opts),
  });

  try {
    await assert.rejects(
      () => extractReceiptImage({ buffer: Buffer.from('test'), mimeType: 'image/png' }, { timeoutMs: 500 }),
      (err) => err instanceof AIResponseValidationError && /malformed json/i.test(err.message)
    );

    await assert.rejects(
      () =>
        uploadReceipt(
          { id: 'user-1', token: 'token' },
          { buffer: Buffer.from('test'), mimeType: 'image/png' },
          { filename: 'receipt.png', mimeType: 'image/png', size: 4, sha256: 'e'.repeat(64) }
        ),
      /Receipt extraction could not be completed/
    );

    assert.equal(userRpcCalls.includes('confirm_receipt_transaction'), false);
    assert.equal(serverRpcCalls.includes('server_complete_receipt_extraction'), false);
    assert.deepEqual(userRpcCalls, []);
    assert.deepEqual(serverRpcCalls, []);
  } finally {
    setAIClientForTests(null);
  }
});

it('prevents duplicate transactions when confirmReceipt is called multiple times on the same draft ID', async () => {
  const finalTransaction = {
    type: 'expense',
    amount: 45000,
    date: '2026-10-24',
    category: 'Food & dining',
    merchant: 'Highlands Coffee',
    note: '',
    items: [],
  };

  const insertedTransactions = [];
  let savedReceipt = null;

  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({
        from: (table) => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (table === 'receipts') return { data: savedReceipt, error: null };
                  if (table === 'expense_transactions') return { data: insertedTransactions[0] || null, error: null };
                  return { data: null, error: null };
                },
              }),
            }),
          }),
        }),
        rpc: async (name, args) => {
          assert.equal(name, 'confirm_staged_receipt_transaction');
          const createdTx = {
            id: `tx-${insertedTransactions.length + 1}`,
            transaction_date: args.p_final_transaction.date,
            ...args.p_final_transaction,
          };
          insertedTransactions.push(createdTx);
          savedReceipt = {
            id: 'receipt-dup-1',
            status: 'confirmed',
            sha256: args.p_sha256,
            transaction_id: createdTx.id,
          };
          return {
            data: { receipt: savedReceipt, transaction: createdTx, idempotent: false },
            error: null,
          };
        },
      }),
      server: () => ({
        storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      }),
    },
  });

  const user = { id: 'user-1', token: 'token' };
  const file = { buffer: Buffer.from('img') };
  const meta = { filename: 'coffee.png', mimeType: 'image/png', size: 3, sha256: 'b'.repeat(64) };

  const firstConfirm = await confirmReceipt(user, file, meta, { draftId: 'draft-dup-1', transaction: finalTransaction });
  assert.equal(firstConfirm.receipt.status, 'confirmed');
  assert.equal(insertedTransactions.length, 1);

  const secondConfirm = await confirmReceipt(user, file, meta, { draftId: 'draft-dup-1', transaction: finalTransaction });
  assert.equal(secondConfirm.idempotent, true);
  assert.equal(secondConfirm.transaction.id, firstConfirm.transaction.id);
  assert.equal(insertedTransactions.length, 1, 'Duplicate confirmation must never insert a second transaction');
});
