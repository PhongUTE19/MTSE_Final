import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMonetaryAmount,
  parseVndAmount,
  parseReceiptAmount,
} from '../../server/src/shared/validation/money.js';
import { receiptExtractionSchema } from '../../server/src/features/receipt/receipt.schema.js';
import { createTransactionArgsSchema } from '../../server/src/features/expenseAssistant/expenseAssistant.schema.js';
import { formatMoney } from '../../client/src/shared/utils/formatters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

describe('P2-T10 VND & Currency Consistency Suite', () => {
  describe('1. Shared backend monetary parser', () => {
    it('parses valid VND inputs with đ, Đ, ₫, dots, spaces, and shorthand k', () => {
      assert.equal(parseVndAmount(183000), 183000);
      assert.equal(parseVndAmount(0), 0);
      assert.equal(parseVndAmount(-50000), -50000);
      assert.equal(parseVndAmount('183000'), 183000);
      assert.equal(parseVndAmount('183.000'), 183000);
      assert.equal(parseVndAmount('1.500.000'), 1500000);
      assert.equal(parseVndAmount('183.000đ'), 183000);
      assert.equal(parseVndAmount('183.000Đ'), 183000);
      assert.equal(parseVndAmount('183.000₫'), 183000);
      assert.equal(parseVndAmount('50 000'), 50000);
      assert.equal(parseVndAmount('  50 000 đ  '), 50000);
      assert.equal(parseVndAmount('500k'), 500000);
    });

    it('rejects foreign currencies in VND-only mode while allowing them in receipt mode', () => {
      assert.equal(parseVndAmount('$12.50'), null);
      assert.equal(parseVndAmount('12.50 USD'), null);
      assert.equal(parseVndAmount('€25.00'), null);
      assert.equal(parseVndAmount('25 EUR'), null);

      assert.equal(parseReceiptAmount('$12.50'), 12.5);
      assert.equal(parseReceiptAmount('12.50 USD'), 12.5);
      assert.equal(parseReceiptAmount('€25.00'), 25);
    });

    it('rejects malformed or ambiguous separator strings', () => {
      assert.equal(parseMonetaryAmount(''), null);
      assert.equal(parseMonetaryAmount('abc'), null);
      assert.equal(parseMonetaryAmount('183.00.00'), null);
      assert.equal(parseMonetaryAmount('1,23,456'), null);
      assert.equal(parseMonetaryAmount('50 00'), null);
      assert.equal(parseMonetaryAmount('12..34'), null);
    });
  });

  describe('2. Receipt OCR extraction parsing & <1000 boundary', () => {
    const base = {
      documentType: 'receipt',
      transactionType: 'expense',
      merchant: 'Highlands Coffee',
      transactionDate: '2026-11-17',
      currency: 'VND',
      category: 'Food & dining',
    };

    it('parses 183.000đ, 183.000Đ, 183.000₫, 50 000, and 183000 accurately', () => {
      assert.equal(receiptExtractionSchema.parse({ ...base, totalAmount: '183.000đ' }).totalAmount, 183000);
      assert.equal(receiptExtractionSchema.parse({ ...base, totalAmount: '183.000Đ' }).totalAmount, 183000);
      assert.equal(receiptExtractionSchema.parse({ ...base, totalAmount: '183.000₫' }).totalAmount, 183000);
      assert.equal(receiptExtractionSchema.parse({ ...base, totalAmount: '50 000' }).totalAmount, 50000);
      assert.equal(receiptExtractionSchema.parse({ ...base, totalAmount: 183000 }).totalAmount, 183000);
    });

    it('handles <1000 boundary for VND without mis-scaling >=1000 or non-VND decimals', () => {
      const below1000 = receiptExtractionSchema.parse({ ...base, totalAmount: 999 });
      assert.equal(below1000.totalAmount, 999000);
      assert.ok(below1000.warnings.some((w) => /under 1,000/i.test(w)));

      const at1000 = receiptExtractionSchema.parse({ ...base, totalAmount: 1000 });
      assert.equal(at1000.totalAmount, 1000);

      const usdSmall = receiptExtractionSchema.parse({ ...base, currency: 'USD', totalAmount: '12.50' });
      assert.equal(usdSmall.totalAmount, 12.5);
      assert.equal(usdSmall.currency, 'USD');
    });
  });

  describe('3. Expense Assistant proposal schema parsing', () => {
    const validBase = {
      type: 'expense',
      date: '2026-11-17',
      category: 'Food & dining',
      merchant: 'Pho 24',
      note: 'Lunch',
    };

    it('accepts numeric and formatted VND strings (500.000đ, 500k, 50 000)', () => {
      assert.equal(createTransactionArgsSchema.parse({ ...validBase, amount: 500000 }).amount, 500000);
      assert.equal(createTransactionArgsSchema.parse({ ...validBase, amount: '500.000đ' }).amount, 500000);
      assert.equal(createTransactionArgsSchema.parse({ ...validBase, amount: '500k' }).amount, 500000);
      assert.equal(createTransactionArgsSchema.parse({ ...validBase, amount: '50 000' }).amount, 50000);
    });

    it('rejects foreign currencies, zero/negative amounts, and malformed strings', () => {
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: '$50' }));
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: '50 USD' }));
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: 0 }));
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: -50000 }));
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: '183.00.00' }));
      assert.throws(() => createTransactionArgsSchema.parse({ ...validBase, amount: 'invalid' }));
    });
  });

  describe('4. Frontend single currency symbol consistency', () => {
    it('formatMoney produces exactly one ₫ symbol and TransactionDetails does not append another', () => {
      for (const sample of [0, 50000, 183000, -50000]) {
        const formatted = formatMoney(sample);
        const symbolCount = (formatted.match(/₫/g) || []).length;
        assert.equal(symbolCount, 1, `Expected 1 ₫ in ${formatted}`);
      }

      const detailsSource = fs.readFileSync(
        path.join(rootDir, 'client/src/features/transaction/TransactionDetails.jsx'),
        'utf8'
      );
      assert.equal(/\{formatMoney\([^)]*\)\}\s*[₫đĐ]/.test(detailsSource), false);
    });
  });
});
