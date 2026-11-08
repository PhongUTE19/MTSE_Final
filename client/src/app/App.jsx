import React, { lazy, Suspense, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { APP_ROUTES } from '../shared/constants';
import { ConfirmProvider, ToastProvider, useToast, useWorkspace } from './providers/index.js';
import WorkspaceLayout from '../layouts/WorkspaceLayout';
import Spinner from '../primitives/feedback/Spinner.jsx';
import { askExpenseAssistant } from '../features/expenseAssistant/expenseAssistantApi.js';
import { receiptApi } from '../features/receipt/receiptApi.js';
import { useReceiptUpload } from '../features/receipt/useReceiptUpload.js';
import { useTransactionDrafts } from '../features/transactionDraft/index.js';

// Lazy-loaded pages, guards, and overlays
const AuthenticatedRouteGuard = lazy(() => import('./guards/AuthenticatedRouteGuard'));
const AdminRouteGuard = lazy(() => import('./guards/AdminRouteGuard'));
const AuthPage = lazy(() => import('../features/auth/AuthPage'));
const AuthCallbackPage = lazy(() => import('../features/auth/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const HomePage = lazy(() => import('../features/home/HomePage'));
const ExpenseLayout = lazy(() => import('../layouts/ExpenseLayout'));
const TransactionPage = lazy(() => import('../features/transaction/TransactionPage'));
const ScanReceiptPage = lazy(() => import('../features/receipt/ScanReceiptPage'));
const CategoriesPage = lazy(() => import('../features/category/CategoriesPage'));
const ExpenseAssistant = lazy(() => import('../features/expenseAssistant/ExpenseAssistant'));
const AdminPage = lazy(() => import('../features/admin/AdminPage'));
const AIUsagePage = lazy(() => import('../features/aiUsage/AIUsagePage'));
const KnowledgeBasePage = lazy(() => import('../features/knowledgeBase/KnowledgeBasePage'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <Spinner size="lg" variant="primary" label="Loading application..." ariaHidden={false} />
    </div>
  );
}

function WorkspaceExpenseAssistant({ userId }) {
  const { notifyTransactionsChanged, notifyReceiptsChanged, setAssistantOpen } = useWorkspace();
  const draftsHook = useTransactionDrafts({ autoFetch: false });

  const handleConfirmDraft = useCallback(
    async (id, data) => {
      const res = await draftsHook.confirmDraft(id, data);
      notifyTransactionsChanged();
      notifyReceiptsChanged();
      return res;
    },
    [draftsHook, notifyTransactionsChanged, notifyReceiptsChanged]
  );

  const handleRejectDraft = useCallback(
    async (id) => {
      const res = await draftsHook.rejectDraft(id);
      return res;
    },
    [draftsHook]
  );

  return (
    <ExpenseAssistant
      userId={userId}
      onAsk={askExpenseAssistant}
      onConfirmDraft={handleConfirmDraft}
      onRejectDraft={handleRejectDraft}
      onSaveDraft={draftsHook.saveDraft}
      onReceiptUpload={receiptApi.upload}
      useReceiptUpload={useReceiptUpload}
      receiptApi={receiptApi}
      onTransactionsChanged={() => {
        notifyTransactionsChanged();
        notifyReceiptsChanged();
      }}
      onOpenChange={setAssistantOpen}
    />
  );
}

function WorkspaceScanReceipt() {
  const draftsHook = useTransactionDrafts();
  const { notifyTransactionsChanged, notifyReceiptsChanged } = useWorkspace();

  const handleConfirmDraft = useCallback(
    async (id, data) => {
      const res = await draftsHook.confirmDraft(id, data);
      notifyTransactionsChanged();
      notifyReceiptsChanged();
      return res;
    },
    [draftsHook, notifyTransactionsChanged, notifyReceiptsChanged]
  );

  return (
    <ScanReceiptPage
      drafts={draftsHook.drafts}
      onConfirmDraft={handleConfirmDraft}
      onRejectDraft={draftsHook.rejectDraft}
      onSaveDraft={draftsHook.saveDraft}
      reloadDrafts={draftsHook.reloadDrafts}
      draftsLoading={draftsHook.loading}
      draftsHook={draftsHook}
      onTransactionSaved={() => {
        notifyTransactionsChanged();
        notifyReceiptsChanged();
      }}
    />
  );
}

function WorkspaceRouteShell() {
  const { toast } = useToast();
  const handleHealthError = useCallback(
    (message) => {
      toast.error(message || 'Server connection lost. Some features may be unavailable.');
    },
    [toast]
  );

  return (
    <AuthenticatedRouteGuard>
      {(auth) => (
        <WorkspaceLayout
          user={auth.user}
          onSignOut={auth.onSignOut}
          onHealthError={handleHealthError}
          overlays={
            <Suspense fallback={null}>
              <WorkspaceExpenseAssistant userId={auth.user.id} />
            </Suspense>
          }
        />
      )}
    </AuthenticatedRouteGuard>
  );
}

function ExpenseIndexRedirect() {
  const location = useLocation();
  const view = location.state?.view;
  let target = APP_ROUTES.EXPENSE_TRANSACTIONS;
  if (view === 'receipt') {
    target = APP_ROUTES.EXPENSE_RECEIPTS;
  } else if (view === 'categories') {
    target = APP_ROUTES.EXPENSE_CATEGORIES;
  }
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <ToastProvider>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path={APP_ROUTES.LANDING} element={<AuthPage />} />

              {/* Public Authentication and Landing Page routes */}
              <Route path={APP_ROUTES.AUTH} element={<AuthPage />} />

              {/* OAuth and Email Confirmation Callback routes */}
              <Route path={APP_ROUTES.AUTH_CALLBACK} element={<AuthCallbackPage />} />

              {/* Password Reset routes */}
              <Route path={APP_ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />

              {/* Persistent Authenticated Workspace Shell */}
              <Route element={<WorkspaceRouteShell />}>
                {/* Shared Home Dashboard accessible to both authenticated User and Admin */}
                <Route path={APP_ROUTES.HOME} element={<HomePage />} />

                {/* Dedicated Personal Finance nested routes */}
                <Route path={APP_ROUTES.EXPENSE} element={<ExpenseLayout />}>
                  <Route index element={<ExpenseIndexRedirect />} />
                  <Route path="receipts" element={<WorkspaceScanReceipt />} />
                  <Route path="transactions" element={<TransactionPage onPreviewReceipt={receiptApi.previewReceipt} />} />
                  <Route path="categories" element={<CategoriesPage />} />
                  <Route path="*" element={<Navigate to={APP_ROUTES.EXPENSE_TRANSACTIONS} replace />} />
                </Route>

                {/* Canonical Admin Workspace nested routes */}
                <Route
                  path={APP_ROUTES.ADMIN}
                  element={
                    <AdminRouteGuard>
                      <AdminPage />
                    </AdminRouteGuard>
                  }
                >
                  <Route index element={<Navigate to={APP_ROUTES.ADMIN_AI_USAGE} replace />} />
                  <Route path="ai-usage" element={<AIUsagePage />} />
                  <Route path="knowledge-base" element={<KnowledgeBasePage />} />
                  <Route path="*" element={<Navigate to={APP_ROUTES.ADMIN_AI_USAGE} replace />} />
                </Route>
              </Route>

              {/* Catch-all fallback route */}
              <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </ConfirmProvider>
    </BrowserRouter>
  );
}
