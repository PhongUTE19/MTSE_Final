import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Admin Route Layout for `/admin/*`.
 * Serves as the parent route/layout for Admin feature pages (Analytics, Knowledge Base),
 * rendering active administrative sub-routes via React Router's Outlet.
 */
export default function AdminPage() {
  return <Outlet />;
}
