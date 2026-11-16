import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AppError,
  DatabaseError,
  handleDatabaseError,
} from '../../server/src/shared/errors/index.js';
import {
  parseIntegerParam,
  zodIntegerParam,
} from '../../server/src/shared/validation/pagination.js';
import { transactionQuerySchema } from '../../server/src/features/transaction/transaction.schema.js';
import { analyticsHistorySchema } from '../../server/src/features/aiUsage/aiUsage.schema.js';
import { paginationQuerySchema } from '../../server/src/features/knowledgeBase/knowledgeBase.schema.js';
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

  describe('4. Frontend CSS Hygiene & Badge/Stat Definitions (FE-TASK-02)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootDir = path.resolve(__dirname, '../..');

    it('ensures knowledgeBase.css is removed and KnowledgeBasePage does not import it', () => {
      const kbCssPath = path.join(rootDir, 'client/src/features/knowledgeBase/knowledgeBase.css');
      assert.equal(fs.existsSync(kbCssPath), false, 'knowledgeBase.css must be deleted');

      const kbPagePath = path.join(rootDir, 'client/src/features/knowledgeBase/KnowledgeBasePage.jsx');
      const kbPageContent = fs.readFileSync(kbPagePath, 'utf8');
      assert.equal(
        kbPageContent.includes("import './knowledgeBase.css'"),
        false,
        'KnowledgeBasePage.jsx must not import knowledgeBase.css'
      );
    });

    it('ensures home.css is deleted and HomePage composes Base Card and Stack directly', () => {
      const homeCssPath = path.join(rootDir, 'client/src/features/home/home.css');
      assert.equal(fs.existsSync(homeCssPath), false, 'home.css must be deleted');

      const homePagePath = path.join(rootDir, 'client/src/features/home/HomePage.jsx');
      const homePageContent = fs.readFileSync(homePagePath, 'utf8');
      assert.equal(
        homePageContent.includes("import './home.css'"),
        false,
        'HomePage.jsx must not import home.css'
      );
      assert.match(homePageContent, /<Card as="section" variant="glass"/);
      assert.match(homePageContent, /<Stack gap="xl">/);
    });

    it('defines subtle variant in Badge primitive and deletes badges.css', () => {
      const badgesCssPath = path.join(rootDir, 'client/src/shared/styles/components/badges.css');
      assert.equal(fs.existsSync(badgesCssPath), false, 'badges.css must be deleted');

      const badgePath = path.join(rootDir, 'client/src/primitives/labels/Badge.jsx');
      const badgeContent = fs.readFileSync(badgePath, 'utf8');
      assert.match(badgeContent, /subtle:\s*'bg-surface-subtle/);
    });

    it('ensures stats.css is deleted as KnowledgeBaseSummary uses Base Badge primitive', () => {
      const statsCssPath = path.join(rootDir, 'client/src/shared/styles/components/stats.css');
      assert.equal(fs.existsSync(statsCssPath), false, 'stats.css must be deleted');
    });

    it('ensures analytics.css is deleted and AnalyticsPage composes Tailwind tokens', () => {
      const analyticsCssPath = path.join(rootDir, 'client/src/features/analytics/analytics.css');
      assert.equal(fs.existsSync(analyticsCssPath), false, 'analytics.css must be deleted');

      const pagePath = path.join(rootDir, 'client/src/features/aiUsage/AIUsagePage.jsx');
      const pageContent = fs.readFileSync(pagePath, 'utf8');
      assert.equal(
        pageContent.includes("import './analytics.css'"),
        false,
        'AIUsagePage.jsx must not import analytics.css'
      );
      assert.equal(
        pageContent.includes("style={{ marginBottom: '16px' }}"),
        false,
        'Inline marginBottom style must be replaced in AIUsagePage'
      );

      const kpiPath = path.join(rootDir, 'client/src/features/aiUsage/AIUsageSummary.jsx');
      const kpiContent = fs.readFileSync(kpiPath, 'utf8');
      assert.equal(
        kpiContent.includes("style={{ marginTop: '4px' }}"),
        false,
        'Inline marginTop style must be replaced in AIUsageSummary'
      );
    });
  });
});
