import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Receipt, History, ShoppingCart, LogOut } from 'lucide-react';

export function PosLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r bg-card flex flex-col shrink-0">
        <div className="p-5 border-b">
          <h1 className="text-xl font-bold text-primary">Svarna POS</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Counter</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {[
            { to: '/pos', label: 'New Bill', icon: Receipt, end: true },
            { to: '/pos/invoices', label: 'Invoices', icon: History, end: false },
            { to: '/pos/orders', label: 'Orders', icon: ShoppingCart, end: false },
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
