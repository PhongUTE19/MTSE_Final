import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { APP_ROUTES } from '../shared/constants';
import { ConfirmProvider } from '../shared/contexts/ConfirmContext';

// Lazy-loaded pages and guards (guards pull in workspace CSS, so keep it off public routes)
const AuthenticatedRouteGuard = lazy(() => import('./guards/AuthenticatedRouteGuard'));
const AdminRouteGuard = lazy(() => import('./guards/AdminRouteGuard'));
const AuthPage = lazy(() => import('../features/auth/AuthPage'));
const AuthCallbackPage = lazy(() => import('../features/auth/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const HomePage = lazy(() => import('../features/home/HomePage'));
const ExpensePage = lazy(() => import('../features/expense/ExpensePage'));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'));
const KnowledgeBasePage = lazy(() => import('../features/knowledgeBase/KnowledgeBasePage'));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen text-slate-500">
      <p>Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path={APP_ROUTES.LANDING} element={<AuthPage />} />

            {/* Shared Home Dashboard accessible to both authenticated User and Admin */}
            <Route
              path={APP_ROUTES.HOME}
              element={
                <AuthenticatedRouteGuard>
                  {(auth) => <HomePage {...auth} />}
                </AuthenticatedRouteGuard>
              }
            />

            {/* Public Authentication and Landing Page routes */}
            <Route path={APP_ROUTES.AUTH} element={<AuthPage />} />

            {/* OAuth and Email Confirmation Callback routes */}
            <Route path={APP_ROUTES.AUTH_CALLBACK} element={<AuthCallbackPage />} />

            {/* Password Reset routes */}
            <Route path={APP_ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />

            {/* Dedicated User Workspace routes */}
            <Route
              path={APP_ROUTES.EXPENSE}
              element={
                <AuthenticatedRouteGuard>
                  {(auth) => <ExpensePage {...auth} />}
                </AuthenticatedRouteGuard>
              }
            />

            {/* Canonical Admin Workspace routes */}
            <Route
              path={APP_ROUTES.ADMIN_ANALYTICS}
              element={
                <AdminRouteGuard>
                  {(auth) => <AnalyticsPage {...auth} />}
                </AdminRouteGuard>
              }
            />
            <Route
              path={APP_ROUTES.ADMIN_KNOWLEDGE}
              element={
                <AdminRouteGuard>
                  {(auth) => <KnowledgeBasePage {...auth} />}
                </AdminRouteGuard>
              }
            />

            {/* Catch-all fallback route */}
            <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
          </Routes>
        </Suspense>
      </ConfirmProvider>
    </BrowserRouter>
  );
}