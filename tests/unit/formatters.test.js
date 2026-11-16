import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseMoney } from '../../client/src/shared/utils/formatters.js';

describe('Currency Standardization and Personal Finance Formatting Suite', () => {
  describe('1. formatMoney VND formatting', () => {
    it('formats standard positive VND amounts with ₫ symbol and no fractional units', () => {
      assert.equal(formatMoney(50000), '₫50,000');
      assert.equal(formatMoney(1500000), '₫1,500,000');
      assert.equal(formatMoney(25000000), '₫25,000,000');
    });

    it('formats zero correctly as ₫0', () => {
      assert.equal(formatMoney(0), '₫0');
    });

    it('formats negative amounts (e.g. negative net balance) cleanly', () => {
      assert.equal(formatMoney(-50000), '-₫50,000');
      assert.equal(formatMoney(-1250000), '-₫1,250,000');
    });

    it('rounds floating-point amounts to integer VND (zero fraction digits)', () => {
      assert.equal(formatMoney(50000.4), '₫50,000');
      assert.equal(formatMoney(50000.7), '₫50,001');
    });

    it('safely handles numeric string values', () => {
      assert.equal(formatMoney('50000'), '₫50,000');
      assert.equal(formatMoney('1500000'), '₫1,500,000');
    });

    it('safely handles null, undefined, and non-numeric inputs without throwing', () => {
      assert.equal(formatMoney(null), '₫0');
      assert.equal(formatMoney(undefined), '₫0');
      assert.equal(formatMoney(''), '₫0');
      assert.equal(formatMoney('not-a-number'), '₫0');
      assert.equal(formatMoney(NaN), '₫0');
    });
  });

  describe('2. parseMoney numeric parsing', () => {
    it('parses plain, negative, and comma-separated VND values', () => {
      assert.equal(parseMoney(183000), 183000);
      assert.equal(parseMoney(0), 0);
      assert.equal(parseMoney(-50000), -50000);
      assert.equal(parseMoney('183000'), 183000);
      assert.equal(parseMoney('0'), 0);
      assert.equal(parseMoney('-50,000'), -50000);
      assert.equal(parseMoney('-₫50,000'), -50000);
      assert.equal(parseMoney('50,000'), 50000);
      assert.equal(parseMoney('1,500,000'), 1500000);
      assert.equal(parseMoney('50000 ₫'), 50000);
    });

    it('parses Vietnamese dot-grouped thousands, đ/Đ/₫ symbols, whitespace, and shorthand k', () => {
      assert.equal(parseMoney('183.000'), 183000);
      assert.equal(parseMoney('1.500.000'), 1500000);
      assert.equal(parseMoney('183.000đ'), 183000);
      assert.equal(parseMoney('183.000Đ'), 183000);
      assert.equal(parseMoney('183.000₫'), 183000);
      assert.equal(parseMoney('50 000'), 50000);
      assert.equal(parseMoney('  50 000 đ  '), 50000);
      assert.equal(parseMoney('1 500 000'), 1500000);
      assert.equal(parseMoney('500k'), 500000);
      assert.equal(parseMoney('500K'), 500000);
      assert.equal(parseMoney('1.5k'), 1500);
    });

    it('preserves valid decimals while rejecting malformed separators and foreign currencies', () => {
      assert.equal(parseMoney('12.50'), 12.5);
      assert.equal(parseMoney('1,250.50'), 1250.5);
      assert.equal(parseMoney('1.250,50'), 1250.5);
      assert.equal(parseMoney('500.5'), 500.5);
      assert.equal(parseMoney('183.00.00'), 0);
      assert.equal(parseMoney('1,23,456'), 0);
      assert.equal(parseMoney('50 00'), 0);
      assert.equal(parseMoney('12..34'), 0);
      assert.equal(parseMoney('$12.50'), 0);
      assert.equal(parseMoney('12.50 USD'), 0);
      assert.equal(parseMoney('€25.00'), 0);
      assert.equal(parseMoney('25 EUR'), 0);
    });

    it('returns 0 for empty, null, or invalid inputs', () => {
      assert.equal(parseMoney(''), 0);
      assert.equal(parseMoney(null), 0);
      assert.equal(parseMoney(undefined), 0);
      assert.equal(parseMoney('invalid'), 0);
      assert.equal(parseMoney('--500'), 0);
      assert.equal(parseMoney(NaN), 0);
    });
  });

  describe('3. Financial summary arithmetic and balance integrity', () => {
    it('calculates net balance = income - expense with exact numeric precision', () => {
      const transactions = [
        { type: 'income', amount: 15000000 },
        { type: 'expense', amount: 3500000 },
        { type: 'expense', amount: 1200000 },
        { type: 'expense', amount: 450000 },
      ];

      const totals = transactions.reduce(
        (acc, tx) => ({
          income: acc.income + (tx.type === 'income' ? tx.amount : 0),
          expense: acc.expense + (tx.type === 'expense' ? tx.amount : 0),
        }),
        { income: 0, expense: 0 }
      );

      const balance = totals.income - totals.expense;

      assert.equal(totals.income, 15000000);
      assert.equal(totals.expense, 5150000);
      assert.equal(balance, 9850000);

      assert.equal(formatMoney(totals.income), '₫15,000,000');
      assert.equal(formatMoney(totals.expense), '₫5,150,000');
      assert.equal(formatMoney(balance), '₫9,850,000');
    });
  });

  describe('4. AI telemetry cost domain separation', () => {
    it('keeps AI provider operating costs denominated in USD while user finance is in VND', () => {
      const aiRequestCostUsd = 0.00042;
      const userTransactionAmountVnd = 45000;

      // Personal finance uses formatMoney (VND ₫)
      const userFormatted = formatMoney(userTransactionAmountVnd);
      assert.equal(userFormatted, '₫45,000');
      assert.ok(userFormatted.includes('₫'));
      assert.ok(!userFormatted.includes('$'));

      // AI provider operating costs remain in USD ($)
      const aiCostDisplay = `$${aiRequestCostUsd.toFixed(5)} USD`;
      assert.equal(aiCostDisplay, '$0.00042 USD');
      assert.ok(aiCostDisplay.includes('$'));
      assert.ok(!aiCostDisplay.includes('₫'));
    });
  });
});
