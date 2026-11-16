import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TRANSACTION_LABELS,
  VIETNAMESE_TRANSACTION_LABELS,
  buildReceiptReviewForm,
  getForeignCurrencyContext,
  isValidCalendarDate,
  updateTransactionField,
  validateTransactionData,
} from '../../client/src/shared/transactions/transactionFieldsUtils.js';
import { categoriesForType } from '../../client/src/shared/transactions/expenseCategories.js';
import { EXPENSE_CATEGORIES } from '../../client/src/shared/transactions/expenseConstants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

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

  describe('3b. Calendar date validation (shared by form, proposal card and receipt review)', () => {
    const base = { merchant: 'Store', amount: '45000', type: 'expense' };

    it('accepts real dates including leap days and rejects impossible ones', () => {
      assert.equal(isValidCalendarDate('2026-10-25'), true);
      assert.equal(isValidCalendarDate('2024-02-29'), true);
      assert.equal(isValidCalendarDate('2026-02-30'), false);
      assert.equal(isValidCalendarDate('2026-02-29'), false);
      assert.equal(isValidCalendarDate('2026-13-01'), false);
      assert.equal(isValidCalendarDate('2026-1-5'), false);
      assert.equal(isValidCalendarDate(''), false);
      assert.equal(isValidCalendarDate(undefined), false);
    });

    it('rejects invalid or missing dates in validateTransactionData (English and Vietnamese)', () => {
      for (const date of ['2026-02-30', '', undefined, 'not-a-date']) {
        const en = validateTransactionData({ ...base, date }, { locale: 'en' });
        assert.equal(en.isValid, false, `date ${date} must be rejected`);
        assert.equal(en.error, 'Enter a valid date (YYYY-MM-DD) before saving.');
      }
      const vi = validateTransactionData({ ...base, date: '2026-02-30' }, { locale: 'vi' });
      assert.equal(vi.isValid, false);
      assert.equal(vi.error, 'Ngày không hợp lệ (YYYY-MM-DD).');
    });

    it('accepts a valid leap-day transaction and keeps merchant/amount checks first', () => {
      assert.equal(validateTransactionData({ ...base, date: '2024-02-29' }).isValid, true);
      assert.equal(validateTransactionData({ ...base, merchant: ' ', date: '2026-02-30' }).error, 'Merchant is required.');
      assert.equal(
        validateTransactionData({ ...base, amount: '0', date: '2026-02-30' }).error,
        'Enter a total amount greater than zero before saving.'
      );
    });
  });

  describe('3c. Receipt review form normalization & non-VND gate', () => {
    const vndDraft = {
      type: 'expense',
      date: '2026-10-25',
      amount: 45000,
      totalAmount: 45000,
      currency: 'VND',
      merchant: 'Store',
      category: 'Shopping',
      items: [{ name: 'Milk', amount: 45000 }],
      warnings: [],
    };

    it('builds a form from a VND draft preserving items and amount', () => {
      const form = buildReceiptReviewForm(vndDraft);
      assert.equal(form.amount, 45000);
      assert.equal(form.date, '2026-10-25');
      assert.equal(form.type, 'expense');
      assert.equal(form.category, 'Shopping');
      assert.deepEqual(form.items, [{ name: 'Milk', amount: 45000 }]);
      assert.equal(getForeignCurrencyContext(vndDraft), null);
    });

    it('derives type from transactionType and fixes a category that does not match the type', () => {
      const income = buildReceiptReviewForm({ transactionType: 'income', category: 'Shopping', merchant: 'Employer' });
      assert.equal(income.type, 'income');
      assert.deepEqual(categoriesForType(EXPENSE_CATEGORIES, 'income').includes(income.category), true);

      const expense = buildReceiptReviewForm({ type: 'expense', category: 'Salary', merchant: 'Shop' });
      assert.equal(expense.category, categoriesForType(EXPENSE_CATEGORIES, 'expense')[0]);

      assert.equal(buildReceiptReviewForm({}).type, 'expense');
    });

    it('never pre-fills the VND amount from a non-VND total and exposes the currency context', () => {
      const usdDraft = { ...vndDraft, currency: 'USD', amount: '', totalAmount: 12.5, foreignAmount: 12.5 };
      const form = buildReceiptReviewForm(usdDraft);
      assert.equal(form.amount, '');
      assert.deepEqual(getForeignCurrencyContext(usdDraft), { currency: 'USD', foreignAmount: 12.5 });
      // Blank amount cannot be confirmed until the user enters a VND value
      assert.equal(validateTransactionData(form).isValid, false);
      assert.equal(validateTransactionData({ ...form, amount: '300000' }).isValid, true);
    });

    it('does not fall back to totalAmount for a foreign draft even if foreignAmount is missing', () => {
      const form = buildReceiptReviewForm({ currency: 'EUR', amount: '', totalAmount: 20, merchant: 'Cafe' });
      assert.equal(form.amount, '');
      assert.deepEqual(getForeignCurrencyContext({ currency: 'eur', totalAmount: 20 }), { currency: 'EUR', foreignAmount: 20 });
    });

    it('falls back to totalAmount/transactionDate for legacy drafts and keeps empty items safe', () => {
      const form = buildReceiptReviewForm({ totalAmount: 70000, transactionDate: '2026-01-02', merchant: 'Old' });
      assert.equal(form.amount, 70000);
      assert.equal(form.date, '2026-01-02');
      assert.deepEqual(form.items, []);
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

  describe('5. FE-TASK-06 modal accessibility, unified fields and warning semantics (source contracts)', () => {
    const fieldsSource = readSource('client/src/composites/transactions/TransactionFields.jsx');
    const formSource = readSource('client/src/features/transaction/ManualEntry.jsx');
    const modalSource = readSource('client/src/composites/overlays/Modal.jsx');
    const modalHookSource = readSource('client/src/shared/hooks/useModalAccessibility.js');
    const reviewSource = readSource('client/src/composites/transactions/TransactionDraftReview.jsx');
    const expenseCssPath = path.join(ROOT, 'client/src/features/expense/expense.css');
    const expenseCss = fs.existsSync(expenseCssPath) ? readSource('client/src/features/expense/expense.css') : '';

    it('TransactionFields renders one unified structure with Type as the only conditional field', () => {
      for (const field of ['type', 'amount', 'date', 'category', 'merchant', 'note']) {
        const occurrences = fieldsSource.match(new RegExp(`name="${field}"`, 'g')) || [];
        assert.equal(occurrences.length, 1, `${field} must be rendered exactly once`);
        assert.match(fieldsSource, new RegExp(`htmlFor=\\{fieldId\\('${field}'\\)\\}`));
        assert.match(fieldsSource, new RegExp(`id=\\{fieldId\\('${field}'\\)\\}`));
      }
      assert.match(fieldsSource, /\{showType && \(/);
      assert.doesNotMatch(fieldsSource, /if \(!showType\)/);
      assert.match(fieldsSource, /useId\(\)/);
    });

    it('TransactionFields keeps its prop contract', () => {
      for (const prop of ['values', 'onChange', 'disabled', 'showType', 'labels', 'layout', 'required', 'noteRows']) {
        assert.match(fieldsSource, new RegExp(`\\b${prop}\\b`));
      }
    });

    it('ManualEntry and Modal form an accessible modal dialog that cannot be dismissed while saving', () => {
      assert.match(modalSource, /role=\{role\}/);
      assert.match(modalSource, /aria-modal=\{ariaModal \? 'true' : undefined\}/);
      assert.match(formSource, /aria-labelledby=\{titleId\}/);
      assert.match(formSource, /<CardTitle[\s\S]*?as="h2"[\s\S]*?id=\{titleId\}>/);
      assert.match(formSource, /dismissible: !saving/);
      assert.match(modalHookSource, /event\.key === 'Escape'/);
      assert.match(modalHookSource, /resolveTabTarget/);
      assert.match(modalHookSource, /restoreFocus\(previouslyFocused\)/);
      assert.equal((modalHookSource.match(/addEventListener\('keydown'/g) || []).length, 1);
      assert.equal((modalHookSource.match(/removeEventListener\('keydown'/g) || []).length, 1);
    });

    it('ReceiptReview separates non-fatal warnings (status) from blocking errors (alert)', () => {
      assert.match(reviewSource, /<ErrorText as="p">/);
      assert.match(reviewSource, /<Alert variant="warning" role="status"/);
      assert.doesNotMatch(reviewSource, /className="form-error" role="status"/);
      assert.doesNotMatch(reviewSource, /className="receipt-warning"/);
    });

    it('verifies ReceiptReview composes Alert for warnings and eliminates .receipt-warning CSS and dead expense.css', () => {
      assert.match(reviewSource, /import Alert from/);
      assert.match(reviewSource, /<Alert variant="warning"/);
      assert.equal(fs.existsSync(expenseCssPath), false, 'expense.css must be eliminated');
    });
  });});
