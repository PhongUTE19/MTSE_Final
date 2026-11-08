import assert from 'node:assert/strict';
import { it } from 'node:test';
import { receiptExtractionSchema } from '../../server/src/features/expenses/receipt.schemas.js';

const base = {
  documentType: 'receipt', transactionType: 'expense', merchant: 'Example shop',
  transactionDate: '2026-10-24', totalAmount: 42, currency: 'VND', note: null,
  items: [], warnings: [],
};

it('normalizes non-contract AI category labels into the existing category set', () => {
  assert.equal(receiptExtractionSchema.parse({ ...base, category: 'Restaurant' }).category, 'Food & dining');
  assert.equal(receiptExtractionSchema.parse({ ...base, category: 'Utilities' }).category, 'Other expenses');
  assert.equal(receiptExtractionSchema.parse({ ...base, category: 'Refund income' }).category, 'Other income');
});

it('keeps usable item lines and drops malformed optional item lines', () => {
  const result = receiptExtractionSchema.parse({
    ...base,
    category: 'Food & dining',
    items: [
      { description: 'Coffee', price: 25000 },
      { name: 'Promo Gift', amount: 0 },
      { amount: 10000 },
      null,
    ],
  });
  assert.deepEqual(result.items, [
    { name: 'Coffee', amount: 25000 },
    { name: 'Promo Gift', amount: 0 },
  ]);
});

it('parses dot-separated VND thousands while preserving decimal semantics and non-VND warnings', () => {
  const vnd = receiptExtractionSchema.parse({
    ...base,
    currency: 'VND',
    totalAmount: '1.250.000',
    items: [{ name: 'Combo', amount: '45.000₫' }],
  });
  assert.equal(vnd.totalAmount, 1250000);
  assert.equal(vnd.items[0].amount, 45000);

  const usd = receiptExtractionSchema.parse({
    ...base,
    currency: 'USD',
    totalAmount: '12.50',
    items: [{ name: 'Coffee', amount: '12.50' }],
  });
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.totalAmount, 12.5);
  assert.equal(usd.items[0].amount, 12.5);
  assert.ok(
    usd.warnings.includes(
      'Receipt currency is USD, but transactions are saved in VND. Please review and enter the VND amount before confirming.'
    )
  );
});

it('normalizes likely Vietnamese thousands values and flags them for review', () => {
  const result = receiptExtractionSchema.parse({ ...base, currency: 'VND', totalAmount: 183, items: [{ name: 'Coffee', amount: 20 }] });
  assert.equal(result.totalAmount, 183000);
  assert.equal(result.items[0].amount, 20000);
  assert.match(result.warnings[0], /normalized as thousands/i);
});

it('safely defaults empty or invalid currency strings to VND', () => {
  assert.equal(receiptExtractionSchema.parse({ ...base, currency: '' }).currency, 'VND');
  assert.equal(receiptExtractionSchema.parse({ ...base, currency: null }).currency, 'VND');
  assert.equal(receiptExtractionSchema.parse({ ...base, currency: undefined }).currency, 'VND');
  assert.equal(receiptExtractionSchema.parse({ ...base, currency: 'USD' }).currency, 'USD');
});

it('preserves null for uncertain or unreadable fields without inventing values', () => {
  const result = receiptExtractionSchema.parse({
    ...base,
    merchant: null,
    transactionDate: null,
    totalAmount: null,
  });
  assert.equal(result.merchant, null);
  assert.equal(result.transactionDate, null);
  assert.equal(result.totalAmount, null);
});
