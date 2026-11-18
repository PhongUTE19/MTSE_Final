import React, { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { APP_ROUTES } from '../shared/constants';
import { getUserRole } from '../shared/services/supabaseAuth';
import { ConfirmProvider, ToastProvider, useToast, useWorkspace } from './providers/index.js';
import WorkspaceLayout from '../layouts/WorkspaceLayout';
import Spinner from '../primitives/feedback/Spinner.jsx';
import { sendChatMessage, sendChatMessageStream } from '../features/chat/chatApi.js';
import { receiptApi } from '../features/receipt/receiptApi.js';
import { useReceiptUpload } from '../features/receipt/useReceiptUpload.js';
import { transactionApi } from '../features/transaction/transactionApi.js';
import { useTransactionDrafts } from '../features/transactionDraft/index.js';
import { createDraftAutoSaveSession } from '../features/transactionDraft/draftAutoSaveSession.js';

// Lazy-loaded pages, guards, and overlays
const AuthenticatedRouteGuard = lazy(() => import('./guards/AuthenticatedRouteGuard'));
const AdminRouteGuard = lazy(() => import('./guards/AdminRouteGuard'));
const RoleRouteGuard = lazy(() => import('./guards/RoleRouteGuard'));
const AuthPage = lazy(() => import('../features/auth/AuthPage'));
const AuthCallbackPage = lazy(() => import('../features/auth/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const HomePage = lazy(() => import('../features/home/HomePage'));
const ExpenseLayout = lazy(() => import('../layouts/ExpenseLayout'));
const TransactionPage = lazy(() => import('../features/transaction/TransactionPage'));
const DraftsPage = lazy(() => import('../features/transactionDraft/DraftsPage'));
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
  const draftsHook = useTransactionDrafts();

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
      onAsk={sendChatMessage}
      onAskStream={sendChatMessageStream}
      drafts={draftsHook.drafts}
      draftsLoading={draftsHook.loading}
      onCreateDraft={draftsHook.createDraft}
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

function WorkspaceTransactions() {
  const { toast } = useToast();
  const { notifyTransactionsChanged, notifyReceiptsChanged } = useWorkspace();
  const draftsHook = useTransactionDrafts({ autoFetch: false });
  const { createDraft, updateDraft, confirmDraft } = draftsHook;

  const sessionRef = useRef(null);
  if (!sessionRef.current) {
    sessionRef.current = createDraftAutoSaveSession({
      createDraft: (...args) => createDraft(...args),
      updateDraft: (...args) => updateDraft(...args),
      onError: (err) => {
        toast.error(err?.message || 'Failed to auto-save draft.');
      },
    });
  }

  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      session.flush().catch(() => {});
      session.reset();
    };
  }, []);

  const handleFormChange = useCallback((nextValues) => {
    sessionRef.current.recordFieldChange(nextValues).catch(() => {});
  }, []);

  const handleReceiptSelect = useCallback(async (file, currentForm) => {
    await sessionRef.current.recordReceiptSelection(file, currentForm);
    const result = await receiptApi.upload(file);
    const receipt = result?.receipt;
    const extraction = receipt?.draft?.originalData || receipt?.extraction || null;
    if (extraction) {
      await sessionRef.current.recordOcrExtraction(extraction, {
        originalData: extraction,
        warnings: receipt?.warnings || receipt?.draft?.warnings || [],
        aiModel: receipt?.aiModel || receipt?.draft?.aiModel || null,
        promptVersion: receipt?.promptVersion || receipt?.draft?.promptVersion || null,
      });
    }
    return {
      extractedFields: extraction,
      warnings: receipt?.warnings || receipt?.draft?.warnings || [],
    };
  }, []);

  const handleConfirmTransaction = useCallback(
    async (transaction) => {
      const session = sessionRef.current;
      await session.flush();
      const draftId = session.getDraftId();
      if (draftId) {
        await confirmDraft(draftId, transaction);
      } else {
        await transactionApi.create(transaction);
      }
      session.reset();
      notifyTransactionsChanged();
      notifyReceiptsChanged();
    },
    [confirmDraft, notifyTransactionsChanged, notifyReceiptsChanged]
  );

  const handleClosePopup = useCallback(async () => {
    const session = sessionRef.current;
    await session.flush();
    session.reset();
  }, []);

  return (
    <TransactionPage
      onPreviewReceipt={receiptApi.previewReceipt}
      onAddTransactionConfirm={handleConfirmTransaction}
      onAddTransactionFormChange={handleFormChange}
      onAddTransactionReceiptSelect={handleReceiptSelect}
      onAddTransactionClose={handleClosePopup}
    />
  );
}

export function WorkspaceRouteShell() {
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
            getUserRole(auth.user) === 'user' ? (
              <Suspense fallback={null}>
                <WorkspaceExpenseAssistant userId={auth.user.id} />
              </Suspense>
            ) : null
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
  if (view === 'receipt' || view === 'drafts') {
    target = APP_ROUTES.EXPENSE_DRAFTS;
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

                {/* Dedicated Personal Finance nested routes (User-only) */}
                <Route
                  path={APP_ROUTES.EXPENSE}
                  element={
                    <RoleRouteGuard allowedRole="user" loadingMessage="Checking workspace access…">
                      <ExpenseLayout />
                    </RoleRouteGuard>
                  }
                >
                  <Route index element={<ExpenseIndexRedirect />} />
                  <Route path="drafts" element={<DraftsPage />} />
                  <Route path="receipts" element={<Navigate to={APP_ROUTES.EXPENSE_DRAFTS} replace />} />
                  <Route path="transactions" element={<WorkspaceTransactions />} />
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
