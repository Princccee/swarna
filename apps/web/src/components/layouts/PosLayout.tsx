import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useRateStore } from '../../stores/rate.store';
import { useAuthStore } from '../../stores/auth.store';
import { RateTicker } from '../shared/RateTicker';
import { ThemeToggle } from '../shared/ThemeToggle';
import { Receipt, History, LogOut } from 'lucide-react';

function useAuth() {
  const store = useAuthStore();
  const navigate = useNavigate();
  const logout = async () => { store.logout(); navigate('/auth/login'); };
  return { user: store.user, logout };
}

const NAV_ITEMS = [
  { to: '/pos',          label: 'New Bill',  icon: Receipt, end: true },
  { to: '/pos/invoices', label: 'Invoices',  icon: History, end: false },
];

export function PosLayout() {
  const { user, logout } = useAuth();
  const rates = useRateStore((s) => s.rates);
  const gold22k = rates['GOLD:GOLD_22K'];
  const gold22kDisplay = gold22k
    ? `₹${gold22k.ratePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/g`
    : '—';

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* ── Header ── */}
      <header className="shrink-0 h-12 bg-card dark:bg-[#18160E] border-b border-border dark:border-white/[0.06] flex items-center px-4 gap-4 z-10">
        <div className="w-44 shrink-0 flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-500 text-sm select-none">◆</span>
          <Link to="/pos" className="text-[14px] font-bold text-foreground tracking-tight">
            Svarna POS
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-muted-foreground text-[11px] font-medium">Gold 22K</span>
          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 text-[13px] tabular-nums">
            {gold22kDisplay}
          </span>
        </div>
        <div className="w-44 shrink-0 flex items-center justify-end gap-3">
          {user?.name && (
            <span className="text-[12px] font-medium text-muted-foreground truncate max-w-[7rem]">
              {user.name}
            </span>
          )}
          <ThemeToggle />
          <button
            onClick={logout}
            title="Sign out"
            className="text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Rate ticker ── */}
      <RateTicker />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-48 bg-stone-50 dark:bg-[#18160E] flex flex-col shrink-0 border-r border-border dark:border-white/[0.05]">
          <nav className="flex-1 p-2.5 space-y-0.5 pt-3">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 py-2.5 pr-3 border-l-2 pl-2.5 ${
                    isActive
                      ? 'bg-amber-50 dark:bg-[#2A2720] text-amber-700 dark:text-amber-400 border-amber-500'
                      : 'text-muted-foreground hover:bg-muted dark:hover:bg-[#22201A] hover:text-foreground dark:hover:text-stone-200 border-transparent'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
