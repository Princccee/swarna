import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Coins, Plus, Search, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { dateIN, inr, Loan, PURITY_LABEL, StatusBadges, unwrap, useLendingBase } from './lending-shared';

type Tab = 'active' | 'overdue' | 'merchant' | 'closed';

interface Summary {
  activeCount: number;
  principalOutstanding: number;
  interestAccrued: number;
  overdueCount: number;
  withMerchantCount: number;
  settings: { overdueMonths: number };
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'merchant', label: 'With merchant' },
  { id: 'closed', label: 'Closed' },
];

export default function LendingListPage() {
  const base = useLendingBase();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const summary = useQuery<Summary>({
    queryKey: ['lending', 'summary'],
    queryFn: () => api.get('/lending/summary').then(unwrap),
  });

  const loans = useQuery<Loan[]>({
    queryKey: ['lending', 'loans', tab, q],
    queryFn: () => api.get('/lending/loans', { params: { tab, ...(q ? { search: q } : {}) } }).then(unwrap),
  });

  const s = summary.data;
  const counts: Partial<Record<Tab, number>> = s
    ? { active: s.activeCount, overdue: s.overdueCount, merchant: s.withMerchantCount }
    : {};

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            <h1 className="text-2xl font-bold">Lending</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Loans against customers' gold and silver (girvi).</p>
        </div>
        <Link
          to={`${base}/new`}
          className="inline-flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> New loan
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Active loans', value: s ? String(s.activeCount) : '—' },
          { label: 'Amount out', value: s ? inr(s.principalOutstanding) : '—' },
          { label: 'Interest due today', value: s ? inr(s.interestAccrued) : '—' },
          { label: `Overdue (${s?.settings.overdueMonths ?? 12}+ months)`, value: s ? String(s.overdueCount) : '—', warn: (s?.overdueCount ?? 0) > 0 },
          { label: 'With merchants', value: s ? String(s.withMerchantCount) : '—' },
        ].map((c) => (
          <div key={c.label} className="bg-card border rounded-xl px-4 py-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.warn ? 'text-red-600' : ''}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap ${
                tab === t.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {counts[t.id] ? <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts[t.id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="relative flex-1 md:max-w-sm md:ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loan no., name or phone"
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Phone: one card per loan */}
      <div className="md:hidden space-y-2">
        {loans.isLoading && (
          <div className="p-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
        )}
        {loans.data?.length === 0 && (
          <div className="p-6 text-center text-muted-foreground bg-card border rounded-xl">
            {q ? 'No loans match your search.' : tab === 'active' ? 'No active loans yet.' : 'Nothing here.'}
          </div>
        )}
        {loans.data?.map((l) => (
          <div
            key={l.id}
            onClick={() => navigate(`${base}/${l.id}`)}
            className="bg-card border rounded-xl p-3.5 active:bg-muted/50 cursor-pointer tabular-nums"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{l.loanNumber}</p>
                <p className="font-medium truncate">{l.customer.name}</p>
                <p className="text-xs text-muted-foreground">{l.customer.phone}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{tab === 'closed' ? 'Closed' : 'Due today'}</p>
                <p className="font-semibold">
                  {l.status === 'ACTIVE' ? inr(l.due?.totalDue) : dateIN(l.closedAt)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
              {l.items.map((i) => `${i.description} (${PURITY_LABEL[i.purity] ?? i.purity}, ${i.netWeightG} g)`).join(', ')}
            </p>
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t text-xs">
              <span className="text-muted-foreground">
                {dateIN(l.loanDate)}{l.status === 'ACTIVE' ? ` · ${l.monthsRunning} mo · out ${inr(l.principal)}` : ''}
              </span>
              <StatusBadges loan={l} />
            </div>
          </div>
        ))}
      </div>

      {/* Table (tablet and desktop) */}
      <div className="hidden md:block bg-card border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Loan</th>
              <th className="text-left font-medium px-4 py-2.5">Customer</th>
              <th className="text-left font-medium px-4 py-2.5">Items</th>
              <th className="text-left font-medium px-4 py-2.5">Date</th>
              <th className="text-right font-medium px-4 py-2.5">Amount out</th>
              <th className="text-right font-medium px-4 py-2.5">{tab === 'closed' ? 'Closed' : 'Due today'}</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loans.isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</td></tr>
            )}
            {loans.data?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                {q ? 'No loans match your search.' : tab === 'active' ? 'No active loans yet.' : 'Nothing here.'}
              </td></tr>
            )}
            {loans.data?.map((l) => (
              <tr
                key={l.id}
                onClick={() => navigate(`${base}/${l.id}`)}
                className="cursor-pointer hover:bg-muted/40"
              >
                <td className="px-4 py-3 font-mono text-xs">{l.loanNumber}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{l.customer.name}</div>
                  <div className="text-xs text-muted-foreground">{l.customer.phone}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">
                  {l.items.map((i) => `${i.description} (${PURITY_LABEL[i.purity] ?? i.purity}, ${i.netWeightG} g)`).join(', ')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {dateIN(l.loanDate)}
                  {l.status === 'ACTIVE' && <div className="text-xs text-muted-foreground">{l.monthsRunning} mo</div>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{inr(l.principal)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {l.status === 'ACTIVE' ? inr(l.due?.totalDue) : <span className="font-normal text-muted-foreground">{dateIN(l.closedAt)}</span>}
                </td>
                <td className="px-4 py-3"><StatusBadges loan={l} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
