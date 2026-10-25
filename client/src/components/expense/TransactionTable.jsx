import { EXPENSE_CATEGORIES } from './expenseConstants';
import { formatMoney } from './expenseFormatters';
import SearchInput from '../common/SearchInput';
import SortableHeader from '../common/SortableHeader';
import Pagination from '../common/Pagination';
import { EditIcon, DeleteIcon } from '../common/Icons';

export default function TransactionTable({ data, filters, loading, onChangeFilters, onEdit, onDelete, onSearch }) {
  const handleSort = (columnKey) => {
    onChangeFilters((current) => ({
      ...current,
      sortBy: columnKey,
      sortOrder:
        current.sortBy === columnKey
          ? current.sortOrder === 'desc'
            ? 'asc'
            : 'desc'
          : 'desc',
      page: '1',
    }));
  };

  return (
    <section className="transaction-panel">
      <div className="panel-heading">
        <div>
          <h2>All transactions</h2>
          <p>Review activity and refine the current result set.</p>
        </div>
        <span className="result-count" aria-live="polite">
          {data.total} total
        </span>
      </div>

      <div className="filters">
        <label className="filter-field filter-search">
          <span>Search</span>
          <SearchInput
            value={filters.search}
            onChange={(val) =>
              onChangeFilters((current) => ({ ...current, search: val, page: '1' }))
            }
            onKeyDown={(event) => event.key === 'Enter' && onSearch?.()}
            onClear={() =>
              onChangeFilters((current) => ({ ...current, search: '', page: '1' }))
            }
            placeholder="Search merchant or note"
            ariaLabel="Search merchant or note"
          />
        </label>

        <label className="filter-field">
          <span>Type</span>
          <select
            value={filters.type}
            onChange={(event) =>
              onChangeFilters((current) => ({ ...current, type: event.target.value, page: '1' }))
            }
          >
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) =>
              onChangeFilters((current) => ({ ...current, category: event.target.value, page: '1' }))
            }
          >
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>From date</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              onChangeFilters((current) => ({ ...current, from: event.target.value, page: '1' }))
            }
          />
        </label>

        <label className="filter-field">
          <span>To date</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              onChangeFilters((current) => ({ ...current, to: event.target.value, page: '1' }))
            }
          />
        </label>

        <div className="filter-actions">
          <button className="secondary-button" onClick={onSearch}>
            Apply filters
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Category</th>
              <SortableHeader
                columnKey="date"
                currentSortKey={filters.sortBy}
                currentDirection={filters.sortOrder}
                onSort={handleSort}
              >
                Date
              </SortableHeader>
              <SortableHeader
                columnKey="amount"
                currentSortKey={filters.sortBy}
                currentDirection={filters.sortOrder}
                onSort={handleSort}
              >
                Amount
              </SortableHeader>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="5" className="empty">
                  Loading transactions…
                </td>
              </tr>
            )}
            {!loading && data.transactions.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">
                  No transactions match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              data.transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <strong>{transaction.merchant}</strong>
                    <small>{transaction.note || transaction.type}</small>
                  </td>
                  <td>
                    <span className="category-pill">{transaction.category}</span>
                  </td>
                  <td>{transaction.date}</td>
                  <td className={transaction.type === 'income' ? 'income' : 'expense'}>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatMoney(transaction.amount)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="row-action row-action--icon"
                        type="button"
                        onClick={() => onEdit(transaction)}
                        aria-label={`Edit ${transaction.merchant}`}
                        title="Edit transaction"
                      >
                        <EditIcon />
                      </button>
                      <button
                        className="row-action row-action--icon danger"
                        type="button"
                        onClick={() => onDelete(transaction)}
                        aria-label={`Delete ${transaction.merchant}`}
                        title="Delete transaction"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={Number(data.page)}
        limit={Number(data.pageSize)}
        total={Number(data.total)}
        loading={loading}
        className="pagination"
        ariaLabel="Transaction pagination"
        showingLabel={() => `${data.total} transaction${data.total === 1 ? '' : 's'}`}
        onPageChange={(nextPage) =>
          onChangeFilters((current) => ({
            ...current,
            page: String(nextPage),
          }))
        }
      />
    </section>
  );
}
