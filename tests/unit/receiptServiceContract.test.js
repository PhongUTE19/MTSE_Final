import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setReceiptDependenciesForTests, uploadReceipt } from '../../server/src/features/expenses/receipt.service.js';

afterEach(() => setReceiptDependenciesForTests());

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

it('removes a temporary receipt row and Storage object when the upload fails', async () => {
  const rpcCalls = [];
  const receipt = { id: 'receipt-1', storage_path: 'user-1/receipt-1/original' };
  const userClient = {
    rpc: async (name) => {
      rpcCalls.push(name);
      if (name === 'create_receipt_upload') return { data: receipt, error: null };
      if (name === 'begin_receipt_delete') return { data: receipt, error: null };
      if (name === 'finalize_receipt_delete') return { data: receipt, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const storageCalls = [];
  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => userClient,
      server: () => ({ storage: { from: () => ({
        upload: async () => ({ error: { message: 'bucket unavailable' } }),
        remove: async (paths) => { storageCalls.push(paths); return { error: null }; },
      }) } }),
    },
  });

  await assert.rejects(
    uploadReceipt({ id: 'user-1', token: 'token' }, { buffer: Buffer.from('image') }, { filename: 'receipt.jpg', mimeType: 'image/jpeg', size: 5, sha256: 'a'.repeat(64) }),
    /temporarily unavailable/,
  );
  assert.deepEqual(rpcCalls, ['create_receipt_upload', 'begin_receipt_delete', 'finalize_receipt_delete']);
  assert.deepEqual(storageCalls, [[receipt.storage_path]]);
});

it('cleans up a failed extraction instead of retaining failed receipt history', async () => {
  const rpcCalls = [];
  const receipt = { id: 'receipt-2', storage_path: 'user-1/receipt-2/original', processing_lease_id: 'lease-1' };
  const serverRpcCalls = [];
  const storageCalls = [];
  setReceiptDependenciesForTests({
    clientFactory: {
      user: () => ({ rpc: async (name) => {
        rpcCalls.push(name);
        if (name === 'create_receipt_upload') return { data: receipt, error: null };
        if (name === 'start_receipt_processing') return { data: receipt, error: null };
        if (name === 'begin_receipt_delete') return { data: receipt, error: null };
        if (name === 'finalize_receipt_delete') return { data: receipt, error: null };
        throw new Error(`Unexpected RPC ${name}`);
      } }),
      server: () => ({
        rpc: async (name) => { serverRpcCalls.push(name); return { data: receipt, error: null }; },
        storage: { from: () => ({ upload: async () => ({ error: null }), remove: async (paths) => { storageCalls.push(paths); return { error: null }; } }) },
      }),
    },
    extractor: async () => { throw new Error('Gemini unavailable'); },
  });

  await assert.rejects(
    uploadReceipt({ id: 'user-1', token: 'token' }, { buffer: Buffer.from('image') }, { filename: 'receipt.jpg', mimeType: 'image/jpeg', size: 5, sha256: 'b'.repeat(64) }),
    /could not be completed/,
  );
  assert.deepEqual(serverRpcCalls, ['server_mark_receipt_failed']);
  assert.deepEqual(rpcCalls, ['create_receipt_upload', 'start_receipt_processing', 'begin_receipt_delete', 'finalize_receipt_delete']);
  assert.deepEqual(storageCalls, [[receipt.storage_path]]);
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
