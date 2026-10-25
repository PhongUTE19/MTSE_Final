import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { ADMIN_TABS, APP_ROUTES } from '../shared/constants';

// Lazy-loaded page components and workspace session gates
const AuthPage = lazy(() => import('../features/auth/AuthPage'));
const AuthCallbackPage = lazy(() => import('../features/auth/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const ExpenseSessionGate = lazy(() => import('../features/expense/ExpenseSessionGate'));
const AdminSessionGate = lazy(() => import('../layouts/AdminSessionGate'));

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
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Public Authentication and Landing Page routes */}
          <Route path={APP_ROUTES.HOME} element={<AuthPage />} />
          <Route path={APP_ROUTES.AUTH} element={<AuthPage />} />

          {/* OAuth and Email Confirmation Callback routes */}
          <Route path={APP_ROUTES.AUTH_CALLBACK} element={<AuthCallbackPage />} />

          {/* Password Reset routes */}
          <Route path={APP_ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />

          {/* Dedicated User Workspace routes */}
          <Route path={APP_ROUTES.EXPENSE} element={<ExpenseSessionGate />} />

          {/* Canonical Admin Workspace routes */}
          <Route
            path={APP_ROUTES.ADMIN_ANALYTICS}
            element={<AdminSessionGate defaultTab={ADMIN_TABS.ANALYTICS} />}
          />
          <Route
            path={APP_ROUTES.ADMIN_KNOWLEDGE}
            element={<AdminSessionGate defaultTab={ADMIN_TABS.KNOWLEDGE} />}
          />

          {/* Canonical Admin redirects */}
          <Route path="/admin" element={<Navigate to={APP_ROUTES.ADMIN_KNOWLEDGE} replace />} />
          <Route path="/analytics" element={<Navigate to={APP_ROUTES.ADMIN_ANALYTICS} replace />} />

          {/* Catch-all fallback route */}
          <Route path="*" element={<Navigate to={APP_ROUTES.HOME} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}