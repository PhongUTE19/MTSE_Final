import React, { useState } from 'react';
import HandbookLayout from './HandbookLayout';
import UserChatView from './user/UserChatView';
import AdminDashboard from './admin/AdminDashboard';
import { useHealth } from '../hooks';
import { USER_ROLES, UI_LABELS } from '../constants';

/**
 * Main handbook view component supporting both demo mode (role switching)
 * and authenticated mode (controlled role and custom header actions).
 */
export default function HandbookView({
  role: controlledRole,
  onRoleChange,
  headerActions,
  title = UI_LABELS.APP.TITLE,
  subtitle,
  kicker,
  defaultTab,
}) {
  const [internalRole, setInternalRole] = useState(USER_ROLES.USER);
  const isControlled = controlledRole !== undefined;
  const activeRole = isControlled ? controlledRole : internalRole;

  const { health, checkHealth } = useHealth(activeRole);

  const handleRoleToggle = () => {
    const nextRole = activeRole === USER_ROLES.USER ? USER_ROLES.ADMIN : USER_ROLES.USER;
    if (!isControlled) {
      setInternalRole(nextRole);
    }
    onRoleChange?.(nextRole);
  };

  const defaultSubtitle = activeRole === USER_ROLES.USER
    ? UI_LABELS.APP.USER_SUBTITLE
    : UI_LABELS.APP.ADMIN_SUBTITLE;

  const demoSwitchButton = (
    <button
      type="button"
      data-role={activeRole}
      className="btn btn-secondary"
      onClick={handleRoleToggle}
      title={activeRole === USER_ROLES.USER ? UI_LABELS.APP.SWITCH_TO_ADMIN_TITLE : UI_LABELS.APP.SWITCH_TO_USER_TITLE}
    >
      {activeRole === USER_ROLES.USER ? UI_LABELS.APP.SWITCH_TO_ADMIN_BTN : UI_LABELS.APP.SWITCH_TO_USER_BTN}
    </button>
  );

  return (
    <HandbookLayout
      title={title}
      subtitle={subtitle || defaultSubtitle}
      kicker={kicker}
      headerActions={headerActions !== undefined ? headerActions : demoSwitchButton}
      health={health}
      onRefreshHealth={checkHealth}
    >
      {activeRole === USER_ROLES.USER ? (
        <UserChatView health={health} onRefreshHealth={checkHealth} />
      ) : (
        <AdminDashboard
          health={health}
          onRefreshHealth={checkHealth}
          defaultTab={defaultTab}
        />
      )}
    </HandbookLayout>
  );
}
