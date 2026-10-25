import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HandbookView from './components/HandbookView';

const AuthPage = lazy(() => import('./components/auth/AuthPage'));
const AuthCallbackPage = lazy(() => import('./components/auth/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('./components/auth/ResetPasswordPage'));
const ExpenseSessionGate = lazy(() => import('./components/expense/ExpenseSessionGate'));
const AdminSessionGate = lazy(() => import('./components/admin/AdminSessionGate'));

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
          {/* Main Student Handbook Assistant application */}
          <Route path="/" element={<HandbookView />} />

          {/* Authentication routes */}
          <Route path="/auth" element={<AuthPage />} />

          {/* OAuth and Email Confirmation Callback routes */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Password Reset routes */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Expense Tracker Workspace routes */}
          <Route path="/expense" element={<ExpenseSessionGate />} />

          {/* Admin Workspace Gate routes */}
          <Route path="/admin" element={<AdminSessionGate />} />

          {/* Catch-all fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}