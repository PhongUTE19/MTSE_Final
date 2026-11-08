import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { PageHeader } from './WorkspaceLayout.jsx';
import Stack from '../primitives/layout/Stack.jsx';
import { APP_ROUTES } from '../shared/constants/routes.js';
import {
  EXPENSE_VIEWS,
  EXPENSE_VIEW_TITLES,
} from '../shared/transactions/expenseConstants.js';

const EXPENSE_ROUTE_META = Object.freeze({
  [APP_ROUTES.EXPENSE_TRANSACTIONS]: {
    title: EXPENSE_VIEW_TITLES[EXPENSE_VIEWS.TRANSACTIONS],
    description: 'Track income and expenses, filter history, and review page totals.',
  },
  [APP_ROUTES.EXPENSE_RECEIPTS]: {
    title: EXPENSE_VIEW_TITLES[EXPENSE_VIEWS.RECEIPT],
    description: 'Upload a receipt image to extract details and review before saving.',
  },
  [APP_ROUTES.EXPENSE_CATEGORIES]: {
    title: EXPENSE_VIEW_TITLES[EXPENSE_VIEWS.CATEGORIES],
    description: 'Secondary category configuration and classification reference.',
  },
});

/**
 * Expense workspace route layout for `/expense/*`.
 * Coordinates sub-route header and outlet context across Transactions, Receipts, and Categories.
 */
export default function ExpenseLayout() {
  const location = useLocation();
  const parentContext = useOutletContext() || {};
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [location.pathname]);

  const currentMeta =
    EXPENSE_ROUTE_META[location.pathname] || EXPENSE_ROUTE_META[APP_ROUTES.EXPENSE_TRANSACTIONS];

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="PERSONAL FINANCE"
        title={currentMeta.title}
        description={currentMeta.description}
      />

      <Outlet context={{ ...parentContext, setError }} />
    </Stack>
  );
}
