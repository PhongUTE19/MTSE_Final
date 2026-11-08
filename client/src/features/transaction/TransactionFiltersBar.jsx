import React from 'react';
import { EXPENSE_CATEGORIES } from '../../shared/transactions/expenseConstants.js';
import { clearSearchFilters } from '../../shared/transactions/transactionFieldsUtils.js';
import { DateRangeFilter, SearchField } from '../../composites/filters/index.js';
import Button from '../../primitives/buttons/Button.jsx';
import Select from '../../primitives/inputs/Select.jsx';
import Label from '../../primitives/labels/Label.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';

/**
 * Filter toolbar for TransactionTable (search, type, category, date range, and apply button).
 */
export default function TransactionFiltersBar({
  filters,
  onChangeFilters,
  onApplySearch,
}) {
  return (
    <Inline gap="sm" align="end" wrap fullWidth>
      <SearchField
        id="tx-filter-search"
        label="Search"
        value={filters.search}
        onChange={(val) =>
          onChangeFilters((current) => ({ ...current, search: val, page: '1' }))
        }
        onSearch={() => onApplySearch()}
        onClear={() => {
          const cleared = clearSearchFilters(filters);
          onChangeFilters(cleared.filters);
          if (cleared.needsExplicitReload) onApplySearch(cleared.filters);
        }}
        placeholder="Search merchant or note"
        ariaLabel="Search merchant or note"
      />

      <Stack gap="2xs">
        <Label htmlFor="tx-filter-type">Type</Label>
        <Select
          id="tx-filter-type"
          value={filters.type}
          onChange={(event) =>
            onChangeFilters((current) => ({ ...current, type: event.target.value, page: '1' }))
          }
        >
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </Select>
      </Stack>

      <Stack gap="2xs">
        <Label htmlFor="tx-filter-category">Category</Label>
        <Select
          id="tx-filter-category"
          value={filters.category}
          onChange={(event) =>
            onChangeFilters((current) => ({ ...current, category: event.target.value, page: '1' }))
          }
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </Select>
      </Stack>

      <DateRangeFilter
        from={filters.from}
        to={filters.to}
        onFromChange={(val) =>
          onChangeFilters((current) => ({ ...current, from: val, page: '1' }))
        }
        onToChange={(val) =>
          onChangeFilters((current) => ({ ...current, to: val, page: '1' }))
        }
        fromId="tx-filter-from"
        toId="tx-filter-to"
        fromLabel="From date"
        toLabel="To date"
        showApplyButton={false}
      />

      <Inline align="center">
        <Button type="button" variant="secondary" onClick={() => onApplySearch()}>
          Apply filters
        </Button>
      </Inline>
    </Inline>
  );
}
