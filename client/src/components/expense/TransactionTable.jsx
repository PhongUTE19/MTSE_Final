import { EXPENSE_CATEGORIES } from './expenseConstants';
import { formatMoney } from './expenseFormatters';

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.8 5.2 18.8 10.2M4 20l4.1-.9L19.5 7.7a2.1 2.1 0 0 0-3-3L5.1 16.1 4 20Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 .8 13h8.4L17 7M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function TransactionTable({ data, filters, loading, onChangeFilters, onEdit, onDelete, onSearch }) {
  const toggleAmountSort = () =>
    onChangeFilters((current) => ({
      ...current,
      sortBy: 'amount',
      sortOrder: current.sortOrder === 'desc' ? 'asc' : 'desc',
    }));

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
          <input
            value={filters.search}
            onChange={(event) =>
              onChangeFilters((current) => ({ ...current, search: event.target.value, page: '1' }))
            }
            onKeyDown={(event) => event.key === 'Enter' && onSearch()}
            placeholder="Search merchant or note"
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
              <th>Date</th>
              <th>
                <button className="sort-button" onClick={toggleAmountSort}>
                  Amount ↕
                </button>
              </th>
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

      <footer className="pagination">
        <span>
          {data.total} transaction{data.total === 1 ? '' : 's'}
        </span>
        <div>
          <button
            className="secondary-button"
            disabled={data.page <= 1}
            onClick={() =>
              onChangeFilters((current) => ({
                ...current,
                page: String(Number(current.page) - 1),
              }))
            }
          >
            Previous
          </button>
          <span>Page {data.page}</span>
          <button
            className="secondary-button"
            disabled={data.page * data.pageSize >= data.total}
            onClick={() =>
              onChangeFilters((current) => ({
                ...current,
                page: String(Number(current.page) + 1),
              }))
            }
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  );
}
