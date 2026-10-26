import React from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceLayout from '../../layouts/WorkspaceLayout';
import { getUserRole } from '../../shared/services/supabaseAuth';
import { APP_ROUTES } from '../../shared/constants';
import './home.css';

/**
 * Shared Home Dashboard for SpendWise.
 * Serves as the primary landing page for authenticated Users and Admins,
 * displaying role-appropriate navigation cards and quick actions.
 */
export default function HomePage({ user, onSignOut }) {
  const navigate = useNavigate();
  const role = getUserRole(user);
  const isAdmin = role === 'admin';

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    (isAdmin ? 'Administrator' : 'User');

  return (
    <WorkspaceLayout
      eyebrow="SPENDWISE"
      title="Dashboard"
      sidebarProps={{ activeView: 'home', user, onSignOut }}
    >
      <div className="home-container">
        <section className="home-hero">
          <div className="home-hero-header">
            <div>
              <h2>Welcome back, {displayName}</h2>
              <p>
                {isAdmin
                  ? 'Administrator control center: monitor AI operational telemetry and access personal finance tools.'
                  : 'Track personal spending, scan receipts with multimodal AI, and keep your finances in balance.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
