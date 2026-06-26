import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  BookOpen,
  FileSpreadsheet,
  Tag,
  ClipboardList,
  ShieldCheck,
  Users,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── sub-components ─────────────────────────────────────────────────────────────

function SkeletonBlock({ h = 'h-4', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} rounded bg-muted animate-pulse`} />;
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  variant?: 'default' | 'accent' | 'warning';
}) {
  const styles = {
    default: {
      card: 'bg-card border-border',
      icon: 'bg-muted text-muted-foreground',
      value: 'text-foreground',
    },
    accent: {
      card: 'bg-amber-50 border-amber-200',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-800',
    },
    warning: {
      card: 'bg-rose-50 border-rose-200',
      icon: 'bg-rose-100 text-rose-600',
      value: 'text-rose-700',
    },
  }[variant];

  return (
    <div className={`rounded-xl border p-5 shadow-sm flex flex-col gap-3 ${styles.card}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={`p-1.5 rounded-lg ${styles.icon}`}>
          <Icon size={14} />
        </span>
      </div>
      <p className={`text-2xl font-bold tabular-nums leading-none ${styles.value}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RegisterCard({
  to,
  label,
  description,
  icon: Icon,
}: {
  to: string;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm hover:border-amber-300 hover:shadow-md transition-all duration-150"
    >
      <span className="mt-0.5 shrink-0 p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-amber-100 group-hover:text-amber-700 transition-colors duration-150">
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
      <ArrowRight
        size={14}
        className="mt-1 shrink-0 text-muted-foreground/40 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all duration-150"
      />
    </Link>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export function AccountantDashboard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/summary').then((r: any) => r.data),
    refetchInterval: 60_000,
  });

  const summary = data?.data ?? data ?? null;

  const todaySalesAmount: number = summary?.todaySales?.totalAmount ?? 0;
  const todaySalesCount: number = summary?.todaySales?.count ?? 0;
  const taxableAmount: number = summary?.todaySales?.taxableAmount ?? todaySalesAmount;
  const gstEstimate: number = Math.round(taxableAmount * 0.03);
  const outstandingDues: number = summary?.outstandingDues ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Accounts Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily summary and register access — refreshes every 60 s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Could not load dashboard data. Check your connection and{' '}
          <button onClick={() => refetch()} className="underline font-medium">
            try again
          </button>
          .
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
              <SkeletonBlock h="h-3" w="w-1/2" />
              <SkeletonBlock h="h-7" w="w-2/3" />
              <SkeletonBlock h="h-3" w="w-1/3" />
            </div>
          ))
        ) : (
          <>
            <SummaryCard
              label="Today's Sales"
              value={formatRupees(todaySalesAmount)}
              sub={`${todaySalesCount} invoice${todaySalesCount !== 1 ? 's' : ''} today`}
              icon={TrendingUp}
              variant="accent"
            />
            <SummaryCard
              label="GST Payable (est.)"
              value={formatRupees(gstEstimate)}
              sub="3% of today's taxable amount — approximate"
              icon={Receipt}
              variant="default"
            />
            <SummaryCard
              label="Outstanding Dues"
              value={formatRupees(outstandingDues)}
              sub="Sum of all balance due"
              icon={AlertTriangle}
              variant={outstandingDues > 0 ? 'warning' : 'default'}
            />
          </>
        )}
      </div>

      {/* Register links */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 pb-2 border-b">
          Registers &amp; Reports
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <RegisterCard
            to="/accountant/registers/sales"
            label="Sales Register"
            description="Day-wise invoice listing with amounts and payment modes"
            icon={BookOpen}
          />
          <RegisterCard
            to="/accountant/registers/gst"
            label="GST Exports"
            description="GSTR-ready data with HSN, taxable value, and tax breakup"
            icon={FileSpreadsheet}
          />
          <RegisterCard
            to="/accountant/registers/huid"
            label="HUID Log"
            description="Hallmark Unique ID entries by item and transaction date"
            icon={Tag}
          />
          <RegisterCard
            to="/accountant/registers/stock"
            label="Stock Audit"
            description="Opening, closing, and movement summary across categories"
            icon={ClipboardList}
          />
          <RegisterCard
            to="/accountant/audit"
            label="Audit Trail"
            description="Full system activity log with actor, entity, and timestamp"
            icon={ShieldCheck}
          />
          <RegisterCard
            to="/accountant/registers/kyc"
            label="KYC Register"
            description="Customer identity records required for high-value transactions"
            icon={Users}
          />
        </div>
      </div>
    </div>
  );
}
