import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  TrendingUp,
} from 'lucide-react';

const navItems = [
  { to: '/owner/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/owner/inventory', label: 'Inventory', icon: Package },
  { to: '/owner/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/owner/invoices', label: 'Invoices', icon: Receipt },
  { to: '/owner/karigar', label: 'Karigar', icon: Users },
  { to: '/owner/rates', label: 'Rates', icon: TrendingUp },
  { to: '/owner/settings', label: 'Settings', icon: Settings },
];

export function OwnerLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 border-r bg-card flex flex-col shrink-0">
        <div className="p-5 border-b">
          <h1 className="text-xl font-bold text-primary">Svarna Jewels</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Owner Console</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 w-full transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
