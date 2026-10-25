import React, { useState } from 'react';
import HealthBadge from './HealthBadge';
import UserChatView from './user/UserChatView';
import AdminDashboard from './admin/AdminDashboard';
import { ToastProvider } from '../context/ToastContext';
import { useHealth } from '../hooks';
import { USER_ROLES, UI_LABELS } from '../constants';

export default function HandbookView() {
  const [role, setRole] = useState(USER_ROLES.USER);
  const { health, checkHealth } = useHealth(role);

  return (
    <ToastProvider>
      <div className="app-container">
        <header className="app-header">
          <div className="split-layout">
            <div>
              <h1 className="app-title">{UI_LABELS.APP.TITLE}</h1>
              <p className="app-subtitle">
                {role === USER_ROLES.USER
                  ? UI_LABELS.APP.USER_SUBTITLE
                  : UI_LABELS.APP.ADMIN_SUBTITLE}
              </p>
            </div>
            <div className="row-layout">
              <button
                type="button"
                data-role={role}
                className="btn btn-secondary"
                onClick={() => {
                  setRole(role === USER_ROLES.USER ? USER_ROLES.ADMIN : USER_ROLES.USER);
                }}
                title={role === USER_ROLES.USER ? UI_LABELS.APP.SWITCH_TO_ADMIN_TITLE : UI_LABELS.APP.SWITCH_TO_USER_TITLE}
              >
                {role === USER_ROLES.USER ? UI_LABELS.APP.SWITCH_TO_ADMIN_BTN : UI_LABELS.APP.SWITCH_TO_USER_BTN}
              </button>
            </div>
          </div>

          <HealthBadge
            status={health.status}
            indexedChunks={health.indexedChunks}
            loading={health.loading}
            error={health.error}
            onRetry={checkHealth}
          />
        </header>

        {role === USER_ROLES.USER ? (
          <UserChatView health={health} onRefreshHealth={checkHealth} />
        ) : (
          <AdminDashboard health={health} onRefreshHealth={checkHealth} />
        )}
      </div>
    </ToastProvider>
  );
}
