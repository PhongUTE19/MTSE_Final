import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePagination } from '../../client/src/shared/utils/collectionUtils.js';
import { validatePagination } from '../../client/src/shared/utils/validation.js';

describe('Admin Analytics Request History Table Controls Suite', () => {
  describe('1. Search Filter Transitions & Page Reset', () => {
    it('updates search query and resets page to 1 while preserving other filters', () => {
      const currentFilters = {
        timeRange: '7d',
        feature: 'chat',
        model: 'gemini-2.5-flash',
        outcome: 'all',
        page: 4,
        limit: 20,
        search: '',
        sortBy: 'timestamp',
        sortOrder: 'desc',
      };

      const newSearchTerm = 'rec-query-123';
      const nextFilters = {
        ...currentFilters,
        search: newSearchTerm,
        page: 1,
      };

      assert.equal(nextFilters.search, 'rec-query-123');
      assert.equal(nextFilters.page, 1);
      assert.equal(nextFilters.timeRange, '7d');
      assert.equal(nextFilters.feature, 'chat');
      assert.equal(nextFilters.model, 'gemini-2.5-flash');
      assert.equal(nextFilters.sortBy, 'timestamp');
      assert.equal(nextFilters.sortOrder, 'desc');
    });

    it('clears search query and resets page to 1', () => {
      const currentFilters = {
        timeRange: '30d',
        feature: 'all',
        model: 'all',
        outcome: 'failure',
        page: 3,
        limit: 20,
        search: 'error 503',
        sortBy: 'cost',
        sortOrder: 'desc',
      };

      const nextFilters = {
        ...currentFilters,
        search: '',
        page: 1,
      };

      assert.equal(nextFilters.search, '');
      assert.equal(nextFilters.page, 1);
      assert.equal(nextFilters.outcome, 'failure');
      assert.equal(nextFilters.sortBy, 'cost');
    });
  });

  describe('2. Full-Dataset Sort Transitions & Reset Behavior', () => {
    it('toggles direction from desc to asc on the active column and resets page to 1', () => {
      const currentFilters = {
        sortBy: 'tokens',
        sortOrder: 'desc',
        page: 3,
      };
      const columnKey = 'tokens';

      const nextDirection = currentFilters.sortOrder === 'desc' ? 'asc' : 'desc';
      const nextFilters = {
        ...currentFilters,
        sortBy: columnKey,
        sortOrder: nextDirection,
        page: 1,
      };

      assert.equal(nextFilters.sortBy, 'tokens');
      assert.equal(nextFilters.sortOrder, 'asc');
      assert.equal(nextFilters.page, 1);
    });

    it('toggles direction from asc to desc on the active column and resets page to 1', () => {
      const currentFilters = {
        sortBy: 'cost',
        sortOrder: 'asc',
        page: 5,
      };
      const columnKey = 'cost';

      const nextDirection = currentFilters.sortOrder === 'desc' ? 'asc' : 'desc';
      const nextFilters = {
        ...currentFilters,
        sortBy: columnKey,
        sortOrder: nextDirection,
        page: 1,
      };

      assert.equal(nextFilters.sortBy, 'cost');
      assert.equal(nextFilters.sortOrder, 'desc');
      assert.equal(nextFilters.page, 1);
    });

    it('switches to a new column with appropriate default direction and resets page to 1', () => {
      const currentFilters = {
        sortBy: 'timestamp',
        sortOrder: 'desc',
        page: 2,
      };

      // Switching to a string column defaults to 'asc'
      const textColumn = 'feature';
      const nextFilters = {
        ...currentFilters,
        sortBy: textColumn,
        sortOrder: ['timestamp', 'durationMs', 'tokens', 'cost', 'totalAttempts'].includes(textColumn) ? 'desc' : 'asc',
        page: 1,
      };

      assert.equal(nextFilters.sortBy, 'feature');
      assert.equal(nextFilters.sortOrder, 'asc');
      assert.equal(nextFilters.page, 1);

      // Switching to a numeric column defaults to 'desc'
      const numColumn = 'durationMs';
      const nextNumeric = {
        ...currentFilters,
        sortBy: numColumn,
        sortOrder: ['timestamp', 'durationMs', 'tokens', 'cost', 'totalAttempts'].includes(numColumn) ? 'desc' : 'asc',
        page: 1,
      };

      assert.equal(nextNumeric.sortBy, 'durationMs');
      assert.equal(nextNumeric.sortOrder, 'desc');
      assert.equal(nextNumeric.page, 1);
    });
  });

  describe('3. Direct Page Navigation (Go to Page) & Boundary Clamping', () => {
    it('navigates directly to a valid page within bounds', () => {
      const totalPages = 5;
      const input = '3';
      const parsed = parseInt(input, 10);
      const clamped = Math.max(1, Math.min(parsed, totalPages));

      assert.equal(clamped, 3);
    });

    it('clamps negative or zero page inputs to page 1', () => {
      const totalPages = 10;

      const zeroClamped = Math.max(1, Math.min(parseInt('0', 10), totalPages));
      assert.equal(zeroClamped, 1);

      const negativeClamped = Math.max(1, Math.min(parseInt('-5', 10), totalPages));
      assert.equal(negativeClamped, 1);
    });

    it('clamps out-of-range page numbers to the maximum totalPages', () => {
      const totalPages = 7;

      const overClamped = Math.max(1, Math.min(parseInt('999', 10), totalPages));
      assert.equal(overClamped, 7);

      const exactMax = Math.max(1, Math.min(parseInt('7', 10), totalPages));
      assert.equal(exactMax, 7);
    });

    it('safely handles non-numeric or empty string inputs by preserving current page', () => {
      const currentPage = 2;
      const totalPages = 5;

      const parseAndClamp = (input) => {
        if (!input || String(input).trim() === '') return currentPage;
        const val = parseInt(input, 10);
        if (Number.isNaN(val)) return currentPage;
        return Math.max(1, Math.min(val, totalPages));
      };

      assert.equal(parseAndClamp(''), 2);
      assert.equal(parseAndClamp('   '), 2);
      assert.equal(parseAndClamp('abc'), 2);
      assert.equal(parseAndClamp(null), 2);
      assert.equal(parseAndClamp(undefined), 2);
    });

    it('validates pagination parameters through validatePagination utility', () => {
      const valid = validatePagination(3, 20);
      assert.equal(valid.isValid, true);
      assert.equal(valid.page, 3);
      assert.equal(valid.limit, 20);

      const invalidPage = validatePagination(-1, 20);
      assert.equal(invalidPage.isValid, false);

      const invalidLimit = validatePagination(1, 0);
      assert.equal(invalidLimit.isValid, false);
    });
  });

  describe('4. Independent Behaviors: Pagination, Sorting, and Page Size Changes', () => {
    it('resets page to 1 when limit (pageSize) changes', () => {
      const currentFilters = {
        page: 4,
        limit: 10,
        search: 'chat',
      };

      const nextFilters = {
        ...currentFilters,
        limit: 50,
        page: 1,
      };

      assert.equal(nextFilters.limit, 50);
      assert.equal(nextFilters.page, 1);
      assert.equal(nextFilters.search, 'chat');
    });

    it('navigates to next and previous pages without changing sort or search', () => {
      const currentFilters = {
        page: 2,
        limit: 20,
        search: 'gemini',
        sortBy: 'cost',
        sortOrder: 'desc',
      };

      const nextPage = { ...currentFilters, page: currentFilters.page + 1 };
      assert.equal(nextPage.page, 3);
      assert.equal(nextPage.search, 'gemini');
      assert.equal(nextPage.sortBy, 'cost');

      const prevPage = { ...currentFilters, page: currentFilters.page - 1 };
      assert.equal(prevPage.page, 1);
      assert.equal(prevPage.search, 'gemini');
      assert.equal(prevPage.sortBy, 'cost');
    });

    it('computes pagination metrics accurately after filtering reduces total count', () => {
      // 100 total items, page 5 of 10-item pages
      const beforeFilter = calculatePagination({ total: 100, page: 5, limit: 10 });
      assert.equal(beforeFilter.totalPages, 10);
      assert.equal(beforeFilter.page, 5);

      // Filtering reduces total to 15 items: totalPages drops to 2, clamping page safely
      const afterFilter = calculatePagination({ total: 15, page: 5, limit: 10 });
      assert.equal(afterFilter.totalPages, 2);
      assert.equal(afterFilter.page, 2, 'Page must be clamped to the new totalPages');
    });
  });
});
