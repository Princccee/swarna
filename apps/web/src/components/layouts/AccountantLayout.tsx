import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, BookOpen, FileText,
  Tag, ClipboardList, UserCheck, ShieldCheck, LogOut,
} from 'lucide-react';
import { RateTicker } from '../shared/RateTicker';

const NAV_LINKS = [
  { to: '/accountant',                   label: 'Dashboard',    icon: LayoutDashboard, end: true  },
  { to: '/accountant/registers/sales',   label: 'Sales Register', icon: BookOpen,     end: false },
  { to: '/accountant/registers/gst',     label: 'GST Exports',  icon: FileText,        end: false },
  { to: '/accountant/registers/huid',    label: 'HUID Log',     icon: Tag,             end: false },
  { to: '/accountant/registers/stock',   label: 'Stock Audit',  icon: ClipboardList,   end: false },
  { to: '/accountant/registers/kyc',     label: 'KYC Register', icon: UserCheck,       end: false },
  { to: '/accountant/audit',             label: 'Audit Trail',  icon: ShieldCheck,     end: false },
];

export function AccountantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-background flex-col">
      <RateTicker />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-60 flex flex-col shrink-0 bg-[#18160E]">

          {/* Brand */}
          <div className="px-5 py-[18px] border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <span className="text-amber-500 text-[15px] leading-none select-none">◆</span>
              <div>
                <h1 className="text-[14px] font-bold text-stone-100 tracking-tight leading-none">
                  Svarna Jewels
                </h1>
                <p className="text-[9px] text-stone-600 uppercase tracking-[0.14em] mt-[5px]">
                  Accountant Console
                </p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
            {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150 py-2.5 pr-3 border-l-2 pl-2.5 ${
                    isActive
                      ? 'bg-[#2A2720] text-amber-400 border-amber-500'
                      : 'text-stone-500 hover:bg-[#22201A] hover:text-stone-200 border-transparent'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 min-w-0 truncate">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User footer */}
          <div className="p-4 border-t border-white/[0.06] bg-[#13120B]">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-amber-900/40 border border-amber-800/40 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-amber-400 select-none">
                  {user?.name?.[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-stone-200 truncate leading-tight">
                  {user?.name}
                </p>
                <p className="text-[9.5px] text-stone-600 uppercase tracking-[0.08em] mt-0.5">
                  {user?.role}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-[12px] text-stone-600 hover:text-amber-400 transition-colors w-full mt-1"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
