import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, BookOpen, FileText,
  Tag, ClipboardList, UserCheck, ShieldCheck, LogOut, Menu,
} from 'lucide-react';
import { RateTicker } from '../shared/RateTicker';
import { ThemeToggle } from '../shared/ThemeToggle';

const NAV_LINKS = [
  { to: '/accountant',                   label: 'Dashboard',      icon: LayoutDashboard, end: true  },
  { to: '/accountant/registers/sales',   label: 'Sales Register', icon: BookOpen,        end: false },
  { to: '/accountant/registers/gst',     label: 'GST Exports',    icon: FileText,        end: false },
  { to: '/accountant/registers/huid',    label: 'HUID Log',       icon: Tag,             end: false },
  { to: '/accountant/registers/stock',   label: 'Stock Audit',    icon: ClipboardList,   end: false },
  { to: '/accountant/registers/kyc',     label: 'KYC Register',   icon: UserCheck,       end: false },
  { to: '/accountant/audit',             label: 'Audit Trail',    icon: ShieldCheck,     end: false },
];

export function AccountantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  function handleLogout() {
    logout();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-background flex-col">
      <RateTicker />

      {/* Top bar — always visible, contains hamburger toggle */}
      <div className="shrink-0 h-12 flex items-center px-4 gap-3 bg-stone-50 dark:bg-[#18160E] border-b border-border dark:border-white/[0.05] z-30">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} />
        </button>
        <span className="text-amber-600 dark:text-amber-500 text-[15px] leading-none select-none">◆</span>
        <span className="text-[14px] font-bold text-foreground tracking-tight">Svarna Jewels</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Accountant Console</span>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Backdrop — mobile only */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={[
            'flex flex-col shrink-0 overflow-hidden',
            'bg-stone-50 dark:bg-[#18160E] border-r border-border dark:border-white/[0.05]',
            'transition-all duration-300 ease-in-out',
            'fixed md:relative inset-y-0 left-0 z-50 md:z-auto',
            'w-60',
            sidebarOpen
              ? 'translate-x-0 md:w-60'
              : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0',
          ].join(' ')}
        >
          {/* Nav */}
          <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto pt-3">
            {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false); }}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 py-2.5 pr-3 border-l-2 pl-2.5 ${
                    isActive
                      ? 'bg-amber-50 dark:bg-[#2A2720] text-amber-700 dark:text-amber-400 border-amber-500'
                      : 'text-muted-foreground hover:bg-muted dark:hover:bg-[#22201A] hover:text-foreground dark:hover:text-stone-200 border-transparent'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 min-w-0 truncate">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User footer */}
          <div className="p-4 border-t border-border dark:border-white/[0.06] bg-muted/60 dark:bg-[#13120B]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 select-none">
                  {user?.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                  {user?.name}
                </p>
                <p className="text-[9.5px] text-muted-foreground uppercase tracking-[0.08em] mt-0.5">
                  {user?.role}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
              >
                <LogOut size={13} />
                Sign out
              </button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
