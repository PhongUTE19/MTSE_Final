const navigationItems = [
  ['transactions', 'Transactions'],
  ['receipt', 'Receipts'],
  ['categories', 'Categories'],
];

export default function ExpenseSidebar({ activeView, onNavigate, user, onSignOut }) {
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Account';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <aside className="expense-sidebar">
      <div className="brand">
        <span className="brand-mark">◉</span>
        <div>
          <strong>spendwise</strong>
          <small>SMART EXPENSE TRACKER</small>
        </div>
      </div>

      <nav aria-label="Expense tracker navigation">
        <p className="sidebar-section-label">Workspace</p>
        {navigationItems.map(([view, label]) => (
          <button
            className={activeView === view ? 'active' : ''}
            key={view}
            onClick={() => onNavigate(view)}
            aria-current={activeView === view ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-user">
        <span>{initials}</span>
        <div>
          <strong>{displayName}</strong>
          <small>Personal workspace</small>
        </div>
        <button type="button" className="sidebar-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
