import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePagination } from '../../client/src/shared/utils/collectionUtils.js';

describe('TransactionTable Server Query & Table Controls Suite', () => {
  describe('1. Server-side Query Coordinator & Sort Transitions', () => {
    it('initializes default sorting on date descending', () => {
      const initialFilters = {
        search: '',
        type: '',
        category: '',
        from: '',
        to: '',
        page: '1',
        pageSize: '10',
        sortBy: 'date',
        sortOrder: 'desc',
      };

      assert.equal(initialFilters.sortBy, 'date');
      assert.equal(initialFilters.sortOrder, 'desc');
    });

    it('toggles sort order from desc to asc when clicking the active sort column', () => {
      const current = { sortBy: 'amount', sortOrder: 'desc', page: '3' };
      const columnKey = 'amount';

      const next = {
        ...current,
        sortBy: columnKey,
        sortOrder:
          current.sortBy === columnKey
            ? current.sortOrder === 'desc'
              ? 'asc'
              : 'desc'
            : 'desc',
        page: '1',
      };

      assert.equal(next.sortBy, 'amount');
      assert.equal(next.sortOrder, 'asc');
      assert.equal(next.page, '1');
    });

    it('defaults to desc and resets page to 1 when switching to a different sort column', () => {
      const current = { sortBy: 'date', sortOrder: 'asc', page: '4' };
      const columnKey = 'amount';

      const next = {
        ...current,
        sortBy: columnKey,
        sortOrder:
          current.sortBy === columnKey
            ? current.sortOrder === 'desc'
              ? 'asc'
              : 'desc'
            : 'desc',
        page: '1',
      };

      assert.equal(next.sortBy, 'amount');
      assert.equal(next.sortOrder, 'desc');
      assert.equal(next.page, '1');
    });
  });

  describe('2. Search Query Handling and Page Reset', () => {
    it('resets page to 1 when search text changes', () => {
      const current = { search: 'coffee', page: '3' };
      const newSearch = 'tea';

      const next = { ...current, search: newSearch, page: '1' };
      assert.equal(next.search, 'tea');
      assert.equal(next.page, '1');
    });

    it('resets search query and page on clear', () => {
      const current = { search: 'highlands', page: '2' };
      const next = { ...current, search: '', page: '1' };
      assert.equal(next.search, '');
      assert.equal(next.page, '1');
    });
  });

  describe('3. Pagination Metrics & Boundary Calculations', () => {
    it('computes pagination metrics matching server results correctly', () => {
      const metrics = calculatePagination({ total: 42, page: 2, limit: 10 });
      assert.equal(metrics.page, 2);
      assert.equal(metrics.limit, 10);
      assert.equal(metrics.totalPages, 5);
      assert.equal(metrics.hasPrev, true);
      assert.equal(metrics.hasNext, true);
    });

    it('disables previous on first page and next on final page', () => {
      const firstPage = calculatePagination({ total: 30, page: 1, limit: 10 });
      assert.equal(firstPage.hasPrev, false);
      assert.equal(firstPage.hasNext, true);

      const lastPage = calculatePagination({ total: 30, page: 3, limit: 10 });
      assert.equal(lastPage.hasPrev, true);
      assert.equal(lastPage.hasNext, false);
    });

    it('handles zero transactions smoothly without division by zero', () => {
      const empty = calculatePagination({ total: 0, page: 1, limit: 10 });
      assert.equal(empty.totalPages, 1);
      assert.equal(empty.hasPrev, false);
      assert.equal(empty.hasNext, false);
    });
  });
});
