import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AppError,
  DatabaseError,
  handleDatabaseError,
} from '../../server/src/shared/errors/index.js';
import {
  parseIntegerParam,
  zodIntegerParam,
} from '../../server/src/shared/validation/pagination.js';
import { transactionQuerySchema } from '../../server/src/features/expenses/expenses.schemas.js';
import { analyticsHistorySchema } from '../../server/src/features/analytics/analytics.schemas.js';
import { paginationQuerySchema } from '../../server/src/features/knowledgeBase/knowledgeBase.schemas.js';
import { toQueryString } from '../../client/src/shared/utils/collectionUtils.js';

describe('Shared Duplications Refactor Suite', () => {
  describe('1. Database Error Diagnostics & Error Wrapping', () => {
    it('instantiates DatabaseError as an operational AppError with status 500', () => {
      const dbErr = new DatabaseError('Persistence failed');
      assert.ok(dbErr instanceof AppError);
      assert.ok(dbErr instanceof Error);
      assert.equal(dbErr.name, 'DatabaseError');
      assert.equal(dbErr.statusCode, 500);
      assert.equal(dbErr.isOperational, true);
      assert.equal(dbErr.message, 'Persistence failed');
    });

    it('handleDatabaseError captures diagnostics and returns sanitized DatabaseError', () => {
      const recordedErrors = [];
      const originalConsoleError = console.error;
      console.error = (...args) => recordedErrors.push(args);

      try {
        const rawPgError = {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
          details: 'Key (id)=(123) already exists.',
          hint: 'Ensure unique ids.',
        };

        const result = handleDatabaseError(
          'ExpenseService',
          'Insert record',
          rawPgError,
          'Expense persistence is temporarily unavailable.'
        );

        assert.ok(result instanceof DatabaseError);
        assert.equal(result.message, 'Expense persistence is temporarily unavailable.');
        assert.equal(result.statusCode, 500);
        assert.equal(result.originalError, rawPgError);

        assert.equal(recordedErrors.length, 1);
        assert.match(recordedErrors[0][0], /\[ExpenseService\] Insert record failed/);
        assert.deepEqual(recordedErrors[0][1], {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
          details: 'Key (id)=(123) already exists.',
          hint: 'Ensure unique ids.',
        });
      } finally {
        console.error = originalConsoleError;
      }
    });

    it('handleDatabaseError safely formats errors when metadata is missing', () => {
      const recordedErrors = [];
      const originalConsoleError = console.error;
      console.error = (...args) => recordedErrors.push(args);

      try {
        const result = handleDatabaseError('ReceiptService', 'Delete storage', null);
        assert.ok(result instanceof DatabaseError);
        assert.equal(result.message, 'Database operation is temporarily unavailable.');
        assert.deepEqual(recordedErrors[0][1], {
          code: null,
          message: null,
          details: null,
          hint: null,
        });
      } finally {
        console.error = originalConsoleError;
      }
    });
  });

  describe('2. Standardized Pagination Validation via zodIntegerParam', () => {
    it('parseIntegerParam handles defaults, bounds, and string parsing predictably', () => {
      assert.equal(parseIntegerParam(undefined, 10, 1, 50), 10);
      assert.equal(parseIntegerParam(null, 10, 1, 50), 10);
      assert.equal(parseIntegerParam('25', 10, 1, 50), 25);
      assert.equal(parseIntegerParam('999', 10, 1, 50), 50);
      assert.equal(parseIntegerParam('-5', 10, 1, 50), 10);
      assert.equal(parseIntegerParam('12.5', 10, 1, 50), 12);
      assert.equal(parseIntegerParam('15abc', 10, 1, 50), 15);
      assert.equal(parseIntegerParam(['20', '40'], 10, 1, 50), 20);
    });

    it('expenses transactionQuerySchema standardizes page and pageSize parsing', () => {
      const defaultParsed = transactionQuerySchema.parse({});
      assert.equal(defaultParsed.page, 1);
      assert.equal(defaultParsed.pageSize, 10);

      const customParsed = transactionQuerySchema.parse({ page: '3', pageSize: '25' });
      assert.equal(customParsed.page, 3);
      assert.equal(customParsed.pageSize, 25);

      const clampedParsed = transactionQuerySchema.parse({ page: '0', pageSize: '9999' });
      assert.equal(clampedParsed.page, 1);
      assert.equal(clampedParsed.pageSize, 50); // Clamped to MAX_PAGE_SIZE (50)
    });

    it('analyticsHistorySchema standardizes page and limit parsing', () => {
      const defaultParsed = analyticsHistorySchema.parse({});
      assert.equal(defaultParsed.page, 1);
      assert.equal(defaultParsed.limit, 20); // PAGINATION_DEFAULTS.DEFAULT_LIMIT (20)

      const customParsed = analyticsHistorySchema.parse({ page: '2', limit: '50' });
      assert.equal(customParsed.page, 2);
      assert.equal(customParsed.limit, 50);

      const clampedParsed = analyticsHistorySchema.parse({ page: '-2', limit: '500' });
      assert.equal(clampedParsed.page, 1);
      assert.equal(clampedParsed.limit, 100); // Clamped to MAX_LIMIT (100)
    });

    it('knowledgeBase paginationQuerySchema standardizes limit and offset parsing', () => {
      const defaultParsed = paginationQuerySchema.parse({});
      assert.equal(defaultParsed.limit, 10);
      assert.equal(defaultParsed.offset, 0);

      const clampedParsed = paginationQuerySchema.parse({ limit: '999', offset: '50' });
      assert.equal(clampedParsed.limit, 50); // Clamped to MAX_LIMIT (50)
      assert.equal(clampedParsed.offset, 50);
    });
  });

  describe('3. Query String Serialization (toQueryString)', () => {
    it('returns empty string for empty, null, or undefined parameters', () => {
      assert.equal(toQueryString({}), '');
      assert.equal(toQueryString(null), '');
      assert.equal(toQueryString(undefined), '');
    });

    it('serializes standard parameters with prefix ? by default', () => {
      const qs = toQueryString({ page: 1, pageSize: 10, type: 'expense' });
      assert.equal(qs, '?page=1&pageSize=10&type=expense');
    });

    it('omits empty string, null, and undefined values automatically', () => {
      const qs = toQueryString({
        search: '',
        type: 'income',
        category: null,
        merchant: undefined,
        page: 2,
      });
      assert.equal(qs, '?type=income&page=2');
    });

    it('supports custom ignore values such as "all" for analytics filters', () => {
      const filters = {
        timeRange: 'all',
        feature: 'all',
        model: 'gemini-1.5-flash',
        outcome: 'all',
        page: 1,
        limit: 25,
      };

      const qs = toQueryString(filters, { ignoreValues: ['', null, undefined, 'all'] });
      assert.equal(qs, '?model=gemini-1.5-flash&page=1&limit=25');
    });

    it('serializes arrays and Date instances cleanly', () => {
      const date = new Date('2026-10-25T12:00:00.000Z');
      const qs = toQueryString({
        startDate: date,
        tags: ['food', 'tuition'],
      });

      assert.equal(
        qs,
        `?startDate=${encodeURIComponent('2026-10-25T12:00:00.000Z')}&tags=food&tags=tuition`
      );
    });

    it('supports omitting the leading ? prefix when prefix: false is passed', () => {
      const qs = toQueryString({ sort: 'asc' }, { prefix: false });
      assert.equal(qs, 'sort=asc');
    });
  });
});
