import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Tag,
  ClipboardList,
  UserCheck,
  ShieldCheck,
  LogOut,
} from 'lucide-react';

const NAV_LINKS = [
  { to: '/accountant', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/accountant/registers/sales', label: 'Sales Register', icon: BookOpen, end: false },
  { to: '/accountant/registers/gst', label: 'GST Exports', icon: FileText, end: false },
  { to: '/accountant/registers/huid', label: 'HUID Log', icon: Tag, end: false },
  { to: '/accountant/registers/stock', label: 'Stock Audit', icon: ClipboardList, end: false },
  { to: '/accountant/registers/kyc', label: 'KYC Register', icon: UserCheck, end: false },
  { to: '/accountant/audit', label: 'Audit Trail', icon: ShieldCheck, end: false },
];

export function AccountantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        {/* Brand */}
        <div className="p-5 border-b">
          <Link to="/accountant" className="block">
            <h1 className="text-xl font-bold text-primary">Svarna</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Accountant Console</p>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="p-4 border-t">
          <p className="text-sm font-medium truncate" title={user?.name}>
            {user?.name}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-destructive mt-2 hover:text-destructive/80 transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top header */}
        <header className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0">
          <span className="text-base font-semibold text-foreground">
            Svarna — Accountant Console
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </header>

        {/* Page outlet */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
