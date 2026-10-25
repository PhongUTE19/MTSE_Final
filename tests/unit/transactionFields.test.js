import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRANSACTION_LABELS,
  VIETNAMESE_TRANSACTION_LABELS,
  updateTransactionField,
  validateTransactionData,
} from '../../client/src/features/expense/transactionFieldsUtils.js';
import { categoriesForType } from '../../client/src/features/expense/expenseCategories.js';
import { EXPENSE_CATEGORIES } from '../../client/src/features/expense/expenseConstants.js';

describe('TransactionFields & Form Consolidation Suite', () => {
  describe('1. updateTransactionField state transitions', () => {
    it('updates standard scalar text and date fields cleanly', () => {
      const initial = {
        type: 'expense',
        amount: '100',
        date: '2026-10-25',
        category: 'Food & dining',
        merchant: 'Highlands',
        note: '',
      };

      const updatedMerchant = updateTransactionField(initial, 'merchant', 'Phúc Long');
      assert.equal(updatedMerchant.merchant, 'Phúc Long');
      assert.equal(initial.merchant, 'Highlands', 'Does not mutate original object');

      const updatedAmount = updateTransactionField(initial, 'amount', '250000');
      assert.equal(updatedAmount.amount, '250000');

      const updatedNote = updateTransactionField(initial, 'note', 'Gặp đối tác');
      assert.equal(updatedNote.note, 'Gặp đối tác');
    });

    it('resets category to first valid income category when changing type from expense to income', () => {
      const expenseState = {
        type: 'expense',
        category: 'Food & dining',
        amount: '50000',
      };

      const incomeState = updateTransactionField(expenseState, 'type', 'income');
      assert.equal(incomeState.type, 'income');
      assert.equal(incomeState.category, 'Salary');
    });

    it('resets category to first valid expense category when changing type from income to expense', () => {
      const incomeState = {
        type: 'income',
        category: 'Salary',
        amount: '10000000',
      };

      const expenseState = updateTransactionField(incomeState, 'type', 'expense');
      assert.equal(expenseState.type, 'expense');
      assert.equal(expenseState.category, 'Food & dining');
    });

    it('preserves category if target type still supports it', () => {
      const incomeState = {
        type: 'income',
        category: 'Salary',
        amount: '10000000',
      };

      // Re-selecting 'income' keeps 'Salary'
      const sameType = updateTransactionField(incomeState, 'type', 'income');
      assert.equal(sameType.category, 'Salary');
    });
  });

  describe('2. categoriesForType filtering logic', () => {
    it('separates expense categories from income categories correctly', () => {
      const expenseCats = categoriesForType(EXPENSE_CATEGORIES, 'expense');
      const incomeCats = categoriesForType(EXPENSE_CATEGORIES, 'income');

      assert.ok(expenseCats.includes('Food & dining'));
      assert.ok(expenseCats.includes('Transportation'));
      assert.ok(!expenseCats.includes('Salary'));
      assert.ok(!expenseCats.includes('Other income'));

      assert.deepEqual(incomeCats, ['Salary', 'Other income']);
    });
  });

  describe('3. validateTransactionData validation rules', () => {
    it('validates a complete transaction correctly', () => {
      const valid = {
        merchant: 'Store ABC',
        amount: '45000',
        date: '2026-10-25',
        type: 'expense',
      };

      const result = validateTransactionData(valid);
      assert.equal(result.isValid, true);
      assert.equal(result.error, null);
      assert.equal(result.amount, 45000);
    });

    it('rejects empty or whitespace-only merchant in English and Vietnamese', () => {
      const emptyMerchant = { merchant: '   ', amount: '50000' };

      const enResult = validateTransactionData(emptyMerchant, { locale: 'en' });
      assert.equal(enResult.isValid, false);
      assert.equal(enResult.error, 'Merchant is required.');

      const viResult = validateTransactionData(emptyMerchant, { locale: 'vi' });
      assert.equal(viResult.isValid, false);
      assert.equal(viResult.error, 'Cửa hàng / mô tả không được để trống.');
    });

    it('rejects zero, negative, or invalid amounts in English and Vietnamese', () => {
      const zeroAmount = { merchant: 'Store', amount: '0' };
      const negativeAmount = { merchant: 'Store', amount: '-500' };
      const nanAmount = { merchant: 'Store', amount: 'not-a-number' };

      assert.equal(validateTransactionData(zeroAmount, { locale: 'en' }).isValid, false);
      assert.equal(validateTransactionData(zeroAmount, { locale: 'en' }).error, 'Enter a total amount greater than zero before saving.');

      assert.equal(validateTransactionData(negativeAmount, { locale: 'en' }).isValid, false);
      assert.equal(validateTransactionData(nanAmount, { locale: 'en' }).isValid, false);

      assert.equal(validateTransactionData(zeroAmount, { locale: 'vi' }).isValid, false);
      assert.equal(validateTransactionData(zeroAmount, { locale: 'vi' }).error, 'Số tiền phải lớn hơn 0.');
    });
  });

  describe('4. Label definitions completeness', () => {
    it('provides matching keys between default English and Vietnamese label sets', () => {
      const defaultKeys = Object.keys(DEFAULT_TRANSACTION_LABELS).sort();
      const viKeys = Object.keys(VIETNAMESE_TRANSACTION_LABELS).sort();

      assert.deepEqual(defaultKeys, viKeys);
      assert.equal(DEFAULT_TRANSACTION_LABELS.type, 'Type');
      assert.equal(VIETNAMESE_TRANSACTION_LABELS.type, 'Loại');
      assert.equal(DEFAULT_TRANSACTION_LABELS.amount, 'Amount');
      assert.equal(VIETNAMESE_TRANSACTION_LABELS.amount, 'Số tiền');
    });
  });
});
