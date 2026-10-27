import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  normalizeReceiptDate,
  normalizeReceiptAmount,
  receiptExtractionSchema,
} from '../../server/src/features/expenses/receipt.schemas.js';
import {
  setReceiptDependenciesForTests,
  uploadReceipt,
  retryReceipt,
  toDraft,
} from '../../server/src/features/expenses/receipt.service.js';

afterEach(() => {
  setReceiptDependenciesForTests();
});

const baseExtraction = {
  documentType: 'receipt',
  transactionType: 'expense',
  merchant: 'Pho 24',
  transactionDate: '2024-05-12',
  totalAmount: 155000,
  currency: 'VND',
  category: 'Food & dining',
  items: [
    { name: 'Pho Bo Dac Biet', amount: 95000 },
    { name: 'Tra Da', amount: 10000 },
    { name: 'Quay', amount: 10000 },
  ],
  warnings: [],
};

describe('Receipt date extraction and normalization', () => {
  it('parses standard ISO date printed on receipt', () => {
    assert.equal(normalizeReceiptDate('2024-05-12'), '2024-05-12');
  });

  it('normalizes various printed calendar date formats without timezone shift', () => {
    // DD/MM/YYYY
    assert.equal(normalizeReceiptDate('15/08/2023'), '2023-08-15');
    // DD-MM-YYYY
    assert.equal(normalizeReceiptDate('20-11-2024'), '2024-11-20');
    // DD.MM.YYYY
    assert.equal(normalizeReceiptDate('05.09.2024'), '2024-09-05');
    // YYYY/MM/DD
    assert.equal(normalizeReceiptDate('2025/01/10'), '2025-01-10');
    // ISO timestamp with time: keeps exact calendar day without timezone shifting
    assert.equal(normalizeReceiptDate('2024-06-18T23:45:00Z'), '2024-06-18');
    assert.equal(normalizeReceiptDate('2024-06-18 14:30:00'), '2024-06-18');
  });

  it('returns null for ambiguous, invalid, or unreadable dates without inventing today', () => {
    // Missing / empty
    assert.equal(normalizeReceiptDate(null), null);
    assert.equal(normalizeReceiptDate(undefined), null);
    assert.equal(normalizeReceiptDate(''), null);
    assert.equal(normalizeReceiptDate('   '), null);
    // Unreadable / non-date strings
    assert.equal(normalizeReceiptDate('unreadable'), null);
    assert.equal(normalizeReceiptDate('N/A'), null);
    assert.equal(normalizeReceiptDate('unknown'), null);
    // Invalid calendar dates (e.g. Feb 30, month 13)
    assert.equal(normalizeReceiptDate('2024-02-30'), null);
    assert.equal(normalizeReceiptDate('2024-13-01'), null);
  });

  it('schema keeps transactionDate strictly as printed date and preserves null for unreadable dates', () => {
    const valid = receiptExtractionSchema.parse({
      ...baseExtraction,
      transactionDate: '12/05/2024',
    });
    assert.equal(valid.transactionDate, '2024-05-12');

    const unreadable = receiptExtractionSchema.parse({
      ...baseExtraction,
      transactionDate: null,
    });
    assert.equal(unreadable.transactionDate, null);
    assert.ok(unreadable.warnings.some((w) => /transaction date could not be determined/i.test(w)));
  });

  it('never substitutes upload timestamp or current date for missing receipt date', () => {
    const today = new Date().toISOString().slice(0, 10);
    const parsed = receiptExtractionSchema.parse({
      ...baseExtraction,
      transactionDate: null,
    });
    assert.equal(parsed.transactionDate, null);
    // Should not silently become today's date
    assert.notEqual(parsed.transactionDate, today);

    // toDraft maps null transactionDate to empty string for review rather than today's date
    const draft = toDraft(parsed);
    assert.equal(draft.date, '');
  });
});

describe('Receipt total amount extraction and normalization', () => {
  it('extracts and normalizes clean numeric amounts', () => {
    assert.equal(normalizeReceiptAmount(155000), 155000);
    assert.equal(normalizeReceiptAmount(42.5), 42.5);
  });

  it('cleans formatted currency strings into numeric amounts', () => {
    assert.equal(normalizeReceiptAmount('155,000 VND'), 155000);
    assert.equal(normalizeReceiptAmount('₫ 250,000'), 250000);
    assert.equal(normalizeReceiptAmount('$ 42.50'), 42.5);
  });

  it('returns null for zero, negative, or invalid amounts rather than fabricating', () => {
    assert.equal(normalizeReceiptAmount(0), null);
    assert.equal(normalizeReceiptAmount(-50000), null);
    assert.equal(normalizeReceiptAmount(''), null);
    assert.equal(normalizeReceiptAmount('Free'), null);
    assert.equal(normalizeReceiptAmount(null), null);
  });

  it('schema preserves final grand total and does not re-sum line items', () => {
    // Here totalAmount printed is 155000, while individual items sum to 100000
    // The printed grand total is the authoritative total and must not be overwritten by line-item sum
    const result = receiptExtractionSchema.parse({
      ...baseExtraction,
      totalAmount: 155000,
      items: [
        { name: 'Item 1', amount: 50000 },
        { name: 'Item 2', amount: 50000 },
      ],
    });
    assert.equal(result.totalAmount, 155000);
    const draft = toDraft(result);
    assert.equal(draft.amount, 155000);
  });

  it('schema preserves null for unreadable amount and flags warning for user review', () => {
    const result = receiptExtractionSchema.parse({
      ...baseExtraction,
      totalAmount: null,
    });
    assert.equal(result.totalAmount, null);
    assert.ok(result.warnings.some((w) => /total amount could not be determined/i.test(w)));

    // toDraft keeps amount as empty string for user editing, not a fabricated number
    const draft = toDraft(result);
    assert.equal(draft.amount, '');
  });
});

describe('Sequential and concurrent receipt processing isolation', () => {
  const receiptA = {
    id: 'receipt-aaa',
    storage_path: 'user-1/receipt-aaa/original',
    processing_lease_id: 'lease-a',
    status: 'review_required',
    extraction: {
      documentType: 'receipt',
      transactionType: 'expense',
      merchant: 'Merchant A',
      transactionDate: '2024-01-15',
      totalAmount: 50000,
      currency: 'VND',
      category: 'Food & dining',
      items: [],
      warnings: [],
    },
  };

  const receiptB = {
    id: 'receipt-bbb',
    storage_path: 'user-1/receipt-bbb/original',
    processing_lease_id: 'lease-b',
    status: 'review_required',
    extraction: {
      documentType: 'receipt',
      transactionType: 'expense',
      merchant: 'Merchant B',
      transactionDate: '2024-08-20',
      totalAmount: 120000,
      currency: 'VND',
      category: 'Shopping',
      items: [],
      warnings: [],
    },
  };

  it('processes two distinct receipts sequentially without cross-contamination', async () => {
    const createdReceipts = new Map([
      ['receipt-aaa', receiptA],
      ['receipt-bbb', receiptB],
    ]);

    let seq = 0;
    setReceiptDependenciesForTests({
      clientFactory: {
        user: () => ({
          rpc: async (name) => {
            if (name === 'create_receipt_upload') {
              seq++;
              const id = seq === 1 ? 'receipt-aaa' : 'receipt-bbb';
              return { data: createdReceipts.get(id), error: null };
            }
            if (name === 'start_receipt_processing') {
              const id = seq === 1 ? 'receipt-aaa' : 'receipt-bbb';
              return { data: createdReceipts.get(id), error: null };
            }
            throw new Error(`Unexpected user RPC: ${name}`);
          },
        }),
        server: () => ({
          rpc: async (name, args) => {
            if (name === 'server_complete_receipt_extraction') {
              return { data: createdReceipts.get(args.p_receipt_id), error: null };
            }
            throw new Error(`Unexpected server RPC: ${name}`);
          },
          storage: {
            from: () => ({
              upload: async () => ({ error: null }),
            }),
          },
        }),
      },
      extractor: async () => {
        if (seq === 1) return { extraction: receiptA.extraction };
        return { extraction: receiptB.extraction };
      },
    });

    const user = { id: 'user-1', token: 'token' };

    // Process Receipt A
    const resA = await uploadReceipt(
      user,
      { buffer: Buffer.from('imageA') },
      { filename: 'receiptA.jpg', mimeType: 'image/jpeg', size: 100, sha256: 'a'.repeat(64) }
    );
    assert.equal(resA.id, 'receipt-aaa');
    assert.equal(resA.extraction.merchant, 'Merchant A');
    assert.equal(resA.extraction.transactionDate, '2024-01-15');
    assert.equal(resA.extraction.totalAmount, 50000);
    const draftA = toDraft(resA.extraction);
    assert.equal(draftA.date, '2024-01-15');
    assert.equal(draftA.amount, 50000);

    // Process Receipt B
    const resB = await uploadReceipt(
      user,
      { buffer: Buffer.from('imageB') },
      { filename: 'receiptB.jpg', mimeType: 'image/jpeg', size: 200, sha256: 'b'.repeat(64) }
    );
    assert.equal(resB.id, 'receipt-bbb');
    assert.equal(resB.extraction.merchant, 'Merchant B');
    assert.equal(resB.extraction.transactionDate, '2024-08-20');
    assert.equal(resB.extraction.totalAmount, 120000);
    const draftB = toDraft(resB.extraction);
    assert.equal(draftB.date, '2024-08-20');
    assert.equal(draftB.amount, 120000);

    // Receipt A values did not bleed into Receipt B
    assert.notEqual(resA.id, resB.id);
    assert.notEqual(draftA.date, draftB.date);
    assert.notEqual(draftA.amount, draftB.amount);
  });

  it('processes two concurrent receipts with proper data isolation and lease tracking', async () => {
    const memory = new Map();

    setReceiptDependenciesForTests({
      clientFactory: {
        user: () => ({
          rpc: async (name, args) => {
            if (name === 'create_receipt_upload') {
              const id = `rec-${Math.random().toString(36).slice(2, 8)}`;
              const rec = {
                id,
                storage_path: `user-1/${id}/original`,
                processing_lease_id: `lease-${id}`,
                status: 'pending',
                extraction: {},
              };
              memory.set(id, rec);
              return { data: rec, error: null };
            }
            if (name === 'start_receipt_processing') {
              const rec = memory.get(args.p_receipt_id);
              return { data: rec, error: null };
            }
            throw new Error(`Unexpected user RPC: ${name}`);
          },
        }),
        server: () => ({
          rpc: async (name, args) => {
            if (name === 'server_complete_receipt_extraction') {
              const rec = memory.get(args.p_receipt_id);
              rec.extraction = args.p_extraction;
              rec.status = 'review_required';
              return { data: rec, error: null };
            }
            throw new Error(`Unexpected server RPC: ${name}`);
          },
          storage: {
            from: () => ({
              upload: async () => ({ error: null }),
            }),
          },
        }),
      },
      extractor: async (image) => {
        // Distinguish content by buffer
        if (image.buffer.toString() === 'coffee') {
          return {
            extraction: {
              ...baseExtraction,
              merchant: 'Coffee Shop',
              transactionDate: '2024-03-01',
              totalAmount: 35000,
            },
          };
        }
        return {
          extraction: {
            ...baseExtraction,
            merchant: 'Supermarket',
            transactionDate: '2024-03-02',
            totalAmount: 480000,
          },
        };
      },
    });

    const user = { id: 'user-1', token: 'token' };

    // Fire both concurrently
    const [result1, result2] = await Promise.all([
      uploadReceipt(
        user,
        { buffer: Buffer.from('coffee') },
        { filename: 'coffee.jpg', mimeType: 'image/jpeg', size: 100, sha256: 'c'.repeat(64) }
      ),
      uploadReceipt(
        user,
        { buffer: Buffer.from('market') },
        { filename: 'market.jpg', mimeType: 'image/jpeg', size: 200, sha256: 'd'.repeat(64) }
      ),
    ]);

    const draft1 = toDraft(result1.extraction);
    const draft2 = toDraft(result2.extraction);

    assert.equal(draft1.merchant, 'Coffee Shop');
    assert.equal(draft1.date, '2024-03-01');
    assert.equal(draft1.amount, 35000);

    assert.equal(draft2.merchant, 'Supermarket');
    assert.equal(draft2.date, '2024-03-02');
    assert.equal(draft2.amount, 480000);
  });

  it('retry retains receipt identity and does not overwrite with stale receipt', async () => {
    const failedReceipt = {
      id: 'receipt-failed-999',
      user_id: 'user-1',
      status: 'failed',
      storage_path: 'user-1/receipt-failed-999/original',
      mime_type: 'image/jpeg',
      filename: 'invoice.jpg',
      processing_lease_id: 'lease-999',
      extraction: null,
    };

    let serverCompletedId = null;
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
            if (name === 'retry_receipt_processing' || name === 'start_receipt_processing') {
              return { data: failedReceipt, error: null };
            }
            throw new Error(`Unexpected RPC: ${name}`);
          },
        }),
        server: () => ({
          rpc: async (name, args) => {
            if (name === 'server_complete_receipt_extraction') {
              serverCompletedId = args.p_receipt_id;
              return {
                data: {
                  ...failedReceipt,
                  status: 'review_required',
                  extraction: args.p_extraction,
                },
                error: null,
              };
            }
            throw new Error(`Unexpected server RPC: ${name}`);
          },
          storage: {
            from: () => ({
              download: async () => ({
                data: { arrayBuffer: async () => Buffer.from('invoice-bytes') },
                error: null,
              }),
            }),
          },
        }),
      },
      extractor: async () => ({
        extraction: {
          ...baseExtraction,
          merchant: 'Invoice Merchant',
          transactionDate: '2024-07-07',
          totalAmount: 99000,
        },
      }),
    });

    const user = { id: 'user-1', token: 'token' };
    const retried = await retryReceipt(user, 'receipt-failed-999');

    assert.equal(retried.id, 'receipt-failed-999');
    assert.equal(serverCompletedId, 'receipt-failed-999');
    assert.equal(retried.extraction.merchant, 'Invoice Merchant');
    assert.equal(retried.extraction.transactionDate, '2024-07-07');
    assert.equal(retried.extraction.totalAmount, 99000);
  });
});
