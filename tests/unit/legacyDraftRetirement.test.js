import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile() && /\.(js|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('P2-T09: Legacy Transaction Draft & Receipt Extraction Retirement', () => {
  it('1. Legacy server feature directory and client transactionDraftApi.js are removed', () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, 'server/src/features/transactionDraft')),
      false,
      'server/src/features/transactionDraft must be retired'
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, 'client/src/features/transactionDraft/transactionDraftApi.js')),
      false,
      'client/src/features/transactionDraft/transactionDraftApi.js must be retired'
    );
  });

  it('2. No active runtime source file mounts /api/transaction-draft or queries legacy tables', () => {
    const runtimeFiles = [
      ...walkFiles(path.join(ROOT, 'server/src')),
      ...walkFiles(path.join(ROOT, 'client/src')),
    ];
    for (const file of runtimeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(content, /\/api\/transaction-draft/, `Unexpected legacy route ref in ${file}`);
      assert.doesNotMatch(content, /\btransaction_drafts\b/, `Unexpected transaction_drafts ref in ${file}`);
      assert.doesNotMatch(content, /\breceipt_extractions\b/, `Unexpected receipt_extractions ref in ${file}`);
    }
  });

  it('3. P2-T07 IndexedDB draft store and P2-T08 chat history remain intact', () => {
    for (const requiredFile of [
      'client/src/features/transactionDraft/draftStorage.js',
      'client/src/features/transactionDraft/draftController.js',
      'client/src/features/transactionDraft/previewUrlManager.js',
      'client/src/features/transactionDraft/useTransactionDrafts.js',
      'server/src/features/chatHistory/chatHistory.route.js',
    ]) {
      assert.equal(fs.existsSync(path.join(ROOT, requiredFile)), true, `Missing required file ${requiredFile}`);
    }
  });

  it('4. Retirement migration drops only legacy draft/extraction objects in dependency order without CASCADE', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/202611170011_retire_legacy_drafts_and_extractions.sql'),
      'utf8'
    );
    const txDraftDropIdx = sql.indexOf('drop table if exists public.transaction_drafts;');
    const extDropIdx = sql.indexOf('drop table if exists public.receipt_extractions;');
    assert.ok(txDraftDropIdx !== -1, 'Must drop public.transaction_drafts');
    assert.ok(extDropIdx !== -1, 'Must drop public.receipt_extractions');
    assert.ok(txDraftDropIdx < extDropIdx, 'transaction_drafts must be dropped before receipt_extractions');
    assert.match(sql, /drop function if exists public\.set_transaction_drafts_updated_at\(\);/i);
    assert.match(sql, /drop function if exists public\.receipt_extractions_immutable_trigger\(\);/i);
    assert.doesNotMatch(sql, /\bcascade\b/i, 'Must not use broad CASCADE');
    assert.doesNotMatch(sql, /drop table[^;]*(receipts|expense_transactions|chat_conversations|chat_messages)/i);
  });
});
