import { PAGINATION } from '../../shared/constants';
import { formatMoney } from '../../shared/utils/formatters';
import SortableHeader from '../../composites/dataDisplay/SortableHeader.jsx';
import Pagination from '../../composites/navigation/Pagination.jsx';
import TransactionFiltersBar from './TransactionFiltersBar.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '../../primitives/table/index.js';

function getNextSortOrder(currentSortKey, currentSortOrder, columnKey) {
  if (currentSortKey !== columnKey) return 'desc';
  return currentSortOrder === 'desc' ? 'asc' : 'desc';
}

export default function TransactionTable({
  data,
  filters,
  loading,
  onChangeFilters,
  onEdit,
  onDelete,
  onSearch,
  onViewDetails,
}) {
  const handleApplySearch = (customFilters) => {
    const target = customFilters || { ...filters, page: '1' };
    onChangeFilters(target);
    onSearch?.(target);
  };

  const handleSort = (columnKey) => {
    onChangeFilters((current) => ({
      ...current,
      sortBy: columnKey,
      sortOrder: getNextSortOrder(current.sortBy, current.sortOrder, columnKey),
      page: '1',
    }));
  };

  return (
    <Card as="section" variant="glass" padding="md" aria-busy={loading}>
      <Stack gap="md">
        <CardHeader as="header">
          <Inline justify="between" align="center" fullWidth>
            <Stack gap="2xs">
              <CardTitle as="h2">All transactions</CardTitle>
              <Text variant="secondary">Review activity and refine the current result set.</Text>
            </Stack>
          </Inline>
        </CardHeader>

        <TransactionFiltersBar
          filters={filters}
          onChangeFilters={onChangeFilters}
          onApplySearch={handleApplySearch}
        />

        <Table variant="comfortable" responsive>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Transaction</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
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
                Amount (₫)
              </SortableHeader>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} variant="empty">
                  <Inline justify="center" align="center" gap="sm">
                    <Spinner size="sm" variant="primary" ariaHidden />
                    <span>Loading transactions…</span>
                  </Inline>
                </TableCell>
              </TableRow>
            )}
            {!loading && data.transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} variant="empty">
                  No transactions match these filters.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              data.transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    <Stack gap="2xs">
                      <Text as="strong" variant="body-sm" weight="semibold">{transaction.merchant}</Text>
                      <Text as="small" variant="caption">{transaction.note || transaction.type}</Text>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Badge size="sm" pill>{transaction.category}</Badge>
                  </TableCell>
                  <TableCell nowrap>{transaction.date}</TableCell>
                  <TableCell variant={transaction.type === 'income' ? 'positive' : 'negative'} nowrap>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatMoney(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    <Inline gap="xs">
                      {onViewDetails && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewDetails(transaction)}
                          aria-label={`View details for ${transaction.merchant}`}
                          title="View transaction details"
                        >
                          Details
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onEdit(transaction)}
                        aria-label={`Edit ${transaction.merchant}`}
                        title="Edit transaction"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => onDelete(transaction)}
                        aria-label={`Delete ${transaction.merchant}`}
                        title="Delete transaction"
                      >
                        Delete
                      </Button>
                    </Inline>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <Pagination
          page={Number(data.page)}
          limit={Number(data.pageSize)}
          total={Number(data.total)}
          pageSizeOptions={PAGINATION.OPTIONS}
          loading={loading}
          ariaLabel="Transaction pagination"
          onPageChange={(nextPage) =>
            onChangeFilters((current) => ({
              ...current,
              page: String(nextPage),
            }))
          }
          onLimitChange={(nextLimit) =>
            onChangeFilters((current) => ({
              ...current,
              pageSize: String(nextLimit),
              page: '1',
            }))
          }
        />
      </Stack>
    </Card>
  );
}
