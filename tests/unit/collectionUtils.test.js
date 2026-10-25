import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePagination,
  paginateItems,
  filterItems,
  sortItems,
  getNextSortDirection,
  getNestedValue,
} from '../../client/src/shared/utils/collectionUtils.js';
import { formatNumber, formatTimestamp } from '../../client/src/shared/utils/formatters.js';

describe('Collection and Table Utilities Suite', () => {
  describe('calculatePagination', () => {
    it('calculates correct metrics for standard pagination', () => {
      const res = calculatePagination({ total: 45, page: 2, limit: 10 });
      assert.strictEqual(res.page, 2);
      assert.strictEqual(res.limit, 10);
      assert.strictEqual(res.offset, 10);
      assert.strictEqual(res.total, 45);
      assert.strictEqual(res.totalPages, 5);
      assert.strictEqual(res.fromIndex, 11);
      assert.strictEqual(res.toIndex, 20);
      assert.strictEqual(res.hasPrev, true);
      assert.strictEqual(res.hasNext, true);
    });

    it('handles zero total items gracefully', () => {
      const res = calculatePagination({ total: 0, page: 1, limit: 10 });
      assert.strictEqual(res.page, 1);
      assert.strictEqual(res.total, 0);
      assert.strictEqual(res.totalPages, 1);
      assert.strictEqual(res.fromIndex, 0);
      assert.strictEqual(res.toIndex, 0);
      assert.strictEqual(res.hasPrev, false);
      assert.strictEqual(res.hasNext, false);
    });

    it('clamps page beyond totalPages to maximum page', () => {
      const res = calculatePagination({ total: 25, page: 10, limit: 10 });
      assert.strictEqual(res.page, 3);
      assert.strictEqual(res.totalPages, 3);
      assert.strictEqual(res.fromIndex, 21);
      assert.strictEqual(res.toIndex, 25);
      assert.strictEqual(res.hasPrev, true);
      assert.strictEqual(res.hasNext, false);
    });

    it('clamps page below 1 to page 1', () => {
      const res = calculatePagination({ total: 50, page: -2, limit: 10 });
      assert.strictEqual(res.page, 1);
      assert.strictEqual(res.fromIndex, 1);
      assert.strictEqual(res.toIndex, 10);
      assert.strictEqual(res.hasPrev, false);
      assert.strictEqual(res.hasNext, true);
    });

    it('computes page correctly from offset when offset is provided', () => {
      const res = calculatePagination({ total: 100, limit: 20, offset: 40 });
      assert.strictEqual(res.page, 3);
      assert.strictEqual(res.offset, 40);
      assert.strictEqual(res.fromIndex, 41);
      assert.strictEqual(res.toIndex, 60);
      assert.strictEqual(res.hasPrev, true);
      assert.strictEqual(res.hasNext, true);
    });

    it('handles last page with partial count', () => {
      const res = calculatePagination({ total: 33, page: 4, limit: 10 });
      assert.strictEqual(res.page, 4);
      assert.strictEqual(res.fromIndex, 31);
      assert.strictEqual(res.toIndex, 33);
      assert.strictEqual(res.hasPrev, true);
      assert.strictEqual(res.hasNext, false);
    });
  });

  describe('paginateItems', () => {
    const sample = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    it('slices items for the requested page and limit', () => {
      assert.deepStrictEqual(paginateItems(sample, 1, 3), ['a', 'b', 'c']);
      assert.deepStrictEqual(paginateItems(sample, 2, 3), ['d', 'e', 'f']);
      assert.deepStrictEqual(paginateItems(sample, 3, 3), ['g']);
    });

    it('returns empty array when page is out of bounds or input is invalid', () => {
      assert.deepStrictEqual(paginateItems(sample, 10, 3), []);
      assert.deepStrictEqual(paginateItems(null, 1, 3), []);
      assert.deepStrictEqual(paginateItems([], 1, 5), []);
    });
  });

  describe('filterItems', () => {
    const items = [
      { id: 1, name: 'Academic Handbook', category: 'Rules', pages: 12 },
      { id: 2, name: 'Tuition Fees 2026', category: 'Finance', pages: 4 },
      { id: 3, name: 'Dormitory Guidelines', category: 'Housing', pages: 8 },
      { id: 4, name: 'Scholarship Details', category: 'Finance', pages: 6 },
    ];

    it('returns all items when query is empty or whitespace', () => {
      assert.strictEqual(filterItems(items, '').length, 4);
      assert.strictEqual(filterItems(items, '   ').length, 4);
      assert.strictEqual(filterItems(items, null).length, 4);
    });

    it('filters across specified search fields with case insensitivity', () => {
      const result = filterItems(items, 'finance', ['category']);
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(
        result.map((r) => r.id),
        [2, 4]
      );
    });

    it('filters across object properties when no search fields are specified', () => {
      const result = filterItems(items, 'dorm');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Dormitory Guidelines');
    });

    it('handles numeric queries correctly', () => {
      const result = filterItems(items, '12', ['pages']);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 1);
    });

    it('handles null items gracefully', () => {
      const mixed = [{ name: 'Valid' }, null, undefined, { name: 'Other' }];
      const result = filterItems(mixed, 'valid', ['name']);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Valid');
    });
  });

  describe('sortItems', () => {
    const items = [
      { id: 1, name: 'Gamma', count: 15, date: '2026-03-01', meta: { score: 90 } },
      { id: 2, name: 'Alpha', count: 50, date: '2026-01-15', meta: { score: 75 } },
      { id: 3, name: 'Beta', count: 5, date: '2026-02-20', meta: { score: null } },
      { id: 4, name: 'Delta', count: 25, date: '2026-04-10', meta: { score: 95 } },
    ];

    it('preserves array if sortKey or direction is not set', () => {
      const res = sortItems(items, null, 'asc');
      assert.deepStrictEqual(res.map((x) => x.id), [1, 2, 3, 4]);

      const resNone = sortItems(items, 'name', 'none');
      assert.deepStrictEqual(resNone.map((x) => x.id), [1, 2, 3, 4]);
    });

    it('sorts strings ascending and descending', () => {
      const asc = sortItems(items, 'name', 'asc');
      assert.deepStrictEqual(asc.map((x) => x.name), ['Alpha', 'Beta', 'Delta', 'Gamma']);

      const desc = sortItems(items, 'name', 'desc');
      assert.deepStrictEqual(desc.map((x) => x.name), ['Gamma', 'Delta', 'Beta', 'Alpha']);
    });

    it('sorts numbers ascending and descending', () => {
      const asc = sortItems(items, 'count', 'asc');
      assert.deepStrictEqual(asc.map((x) => x.count), [5, 15, 25, 50]);

      const desc = sortItems(items, 'count', 'desc');
      assert.deepStrictEqual(desc.map((x) => x.count), [50, 25, 15, 5]);
    });

    it('sorts date strings ascending and descending', () => {
      const asc = sortItems(items, 'date', 'asc');
      assert.deepStrictEqual(asc.map((x) => x.id), [2, 3, 1, 4]);

      const desc = sortItems(items, 'date', 'desc');
      assert.deepStrictEqual(desc.map((x) => x.id), [4, 1, 3, 2]);
    });

    it('sorts nested properties via dot notation and places nulls at bottom', () => {
      const asc = sortItems(items, 'meta.score', 'asc');
      assert.deepStrictEqual(asc.map((x) => x.id), [2, 1, 4, 3]);

      const desc = sortItems(items, 'meta.score', 'desc');
      assert.deepStrictEqual(desc.map((x) => x.id), [4, 1, 2, 3]);
    });

    it('supports custom comparators', () => {
      const comparators = {
        customLength: (a, b, dir) => {
          const lenA = a.name.length;
          const lenB = b.name.length;
          return dir === 'desc' ? lenB - lenA : lenA - lenB;
        },
      };

      const sorted = sortItems(items, 'customLength', 'asc', comparators);
      assert.strictEqual(sorted[0].name, 'Beta');
    });

    it('does not mutate the source array', () => {
      const originalCopy = [...items];
      sortItems(items, 'name', 'asc');
      assert.deepStrictEqual(items, originalCopy);
    });
  });

  describe('getNextSortDirection', () => {
    it('cycles from none to asc to desc to null', () => {
      assert.strictEqual(getNextSortDirection(null), 'asc');
      assert.strictEqual(getNextSortDirection('none'), 'asc');
      assert.strictEqual(getNextSortDirection('asc'), 'desc');
      assert.strictEqual(getNextSortDirection('desc'), null);
    });
  });

  describe('getNestedValue', () => {
    it('extracts top-level and deep values correctly', () => {
      const obj = { user: { profile: { age: 22 } }, tags: ['admin'] };
      assert.strictEqual(getNestedValue(obj, 'user.profile.age'), 22);
      assert.strictEqual(getNestedValue(obj, 'user.nonexistent'), undefined);
      assert.strictEqual(getNestedValue(null, 'user.age'), undefined);
    });
  });

  describe('formatNumber', () => {
    it('formats valid numbers with locale string', () => {
      assert.strictEqual(formatNumber(1000), (1000).toLocaleString());
      assert.strictEqual(formatNumber(0), '0');
    });

    it('returns 0 for null or undefined', () => {
      assert.strictEqual(formatNumber(null), '0');
      assert.strictEqual(formatNumber(undefined), '0');
    });
  });

  describe('formatTimestamp', () => {
    it('formats ISO timestamps into YYYY-MM-DD HH:mm:ss format', () => {
      const formatted = formatTimestamp('2026-10-22T12:30:45.000Z');
      assert.strictEqual(formatted, '2026-10-22 12:30:45');
    });

    it('returns dash for null or undefined or empty', () => {
      assert.strictEqual(formatTimestamp(null), '—');
      assert.strictEqual(formatTimestamp(undefined), '—');
      assert.strictEqual(formatTimestamp(''), '—');
    });

    it('returns raw string if parsing fails', () => {
      assert.strictEqual(formatTimestamp('invalid-date'), 'invalid-date');
    });
  });
});
