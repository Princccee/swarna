import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, BookOpen, FileText, LogOut, ClipboardList } from 'lucide-react';

export function AccountantLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 border-r bg-card flex flex-col shrink-0">
        <div className="p-5 border-b">
          <h1 className="text-xl font-bold text-primary">Svarna</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Accounts</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {[
            { to: '/accountant', label: 'Dashboard', icon: LayoutDashboard, end: true },
            { to: '/accountant/registers/sales', label: 'Sales Register', icon: BookOpen, end: false },
            { to: '/accountant/registers/gst', label: 'GST Reports', icon: FileText, end: false },
            { to: '/accountant/registers/stock', label: 'Stock Audit', icon: ClipboardList, end: false },
          ].map(({ to, label, icon: Icon, end }) => (
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
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-destructive mt-2 hover:text-destructive/80"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
