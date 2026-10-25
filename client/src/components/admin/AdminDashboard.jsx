import React, { useState, useEffect } from 'react';
import AdminAnalyticsDashboard from './analytics/AdminAnalyticsDashboard';
import AdminKnowledgeBaseDashboard from './AdminKnowledgeBaseDashboard';
import { ADMIN_TABS } from '../../constants';

/**
 * Route and tab coordinator for the Admin workspace.
 * Selectively renders AdminAnalyticsDashboard or AdminKnowledgeBaseDashboard
 * based on current tab/route selection while preserving authorization and health state.
 */
export default function AdminDashboard({
  health,
  onRefreshHealth,
  defaultTab = ADMIN_TABS.KNOWLEDGE,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="dashboard-container">
      {activeTab === ADMIN_TABS.ANALYTICS ? (
        <AdminAnalyticsDashboard />
      ) : (
        <AdminKnowledgeBaseDashboard
          health={health}
          onRefreshHealth={onRefreshHealth}
        />
      )}
    </div>
  );
}
