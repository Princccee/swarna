import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
  Package,
  RefreshCw,
  Activity,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const RATE_LABELS: Record<string, string> = {
  GOLD_24K: 'Gold 24K',
  GOLD_22K: 'Gold 22K',
  GOLD_18K: 'Gold 18K',
  SILVER_999: 'Silver 999',
};

const RATE_ORDER = ['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'SILVER_999'];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600',
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        accent
          ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/30'
          : 'bg-card'
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span
          className={`p-1.5 rounded-lg ${
            accent
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-800/30 dark:text-amber-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon size={14} />
        </span>
      </div>
      <p
        className={`text-2xl font-bold tabular-nums leading-none ${
          accent ? 'text-amber-800 dark:text-amber-300' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-400 mb-3 pb-2 border-b">
      {title}
    </h3>
  );
}

function SkeletonLine({ w = 'w-full' }: { w?: string }) {
  return <div className={`h-4 skeleton ${w}`} />;
}

// ── IRN Retry button ──────────────────────────────────────────────────────────

function RetryIrnButton({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const { mutate, isPending, isSuccess, isError } = useMutation({
    mutationFn: () =>
      api.post(`/billing/invoices/${invoiceId}/irn`).then((r: any) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (isSuccess)
    return (
      <span className="text-xs text-emerald-600 font-medium">Queued</span>
    );

  return (
    <button
      onClick={() => mutate()}
      disabled={isPending}
      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-700/50 dark:text-amber-400 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors"
    >
      <RefreshCw size={11} className={isPending ? 'animate-spin' : ''} />
      {isPending ? 'Retrying…' : isError ? 'Retry IRN' : 'Retry IRN'}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function OwnerDashboard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/summary').then((r: any) => r.data),
    refetchInterval: 60_000,
  });

  const summary = data?.data ?? data ?? null;

  // Derive stats
  const todaySalesAmount: number = summary?.todaySales?.totalAmount ?? 0;
  const todaySalesCount: number = summary?.todaySales?.count ?? 0;
  const outstandingDues: number = summary?.outstandingDues ?? 0;
  const pendingOrders: number = summary?.pendingOrders ?? 0;
  const lowStockCount: number = summary?.lowStock?.length ?? summary?.lowStockCount ?? 0;

  const auditEvents: any[] = summary?.recentActivity ?? [];
  const irnFailures: any[] = summary?.irnPending ?? [];
  const rates: Record<string, number> = summary?.rates ?? {};
  const lowStockItems: any[] = summary?.lowStock ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live snapshot — refreshes every 60 s
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

      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
              <SkeletonLine w="w-2/3" />
              <SkeletonLine w="w-1/2" />
              <SkeletonLine w="w-1/3" />
            </div>
          ))
        ) : (
          <>
            {[
              { label: "Today's Sales", value: formatRupees(todaySalesAmount), sub: `${todaySalesCount} invoice${todaySalesCount !== 1 ? 's' : ''} today`, icon: TrendingUp, accent: true },
              { label: 'Outstanding Dues', value: formatRupees(outstandingDues), sub: 'Sum of all balance due', icon: AlertTriangle, accent: false },
              { label: 'Pending Orders', value: pendingOrders, sub: 'Confirmed · Making · Ready', icon: ShoppingBag, accent: false },
              { label: 'Low Stock Items', value: lowStockCount, sub: 'Items at or below threshold', icon: Package, accent: false },
            ].map((card, i) => (
              <div
                key={card.label}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <StatCard {...card} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Row 2 — Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column — 60% */}
        <div className="lg:col-span-3 space-y-6">
          {/* Recent Activity */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <SectionHeader title="Recent Activity" />
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <SkeletonLine w="w-16" />
                    <SkeletonLine w="w-full" />
                    <SkeletonLine w="w-12" />
                  </div>
                ))}
              </div>
            ) : auditEvents.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Activity size={14} />
                No recent activity
              </div>
            ) : (
              <div className="space-y-0 divide-y">
                {auditEvents.slice(0, 20).map((event: any, i: number) => (
                  <div key={event.id ?? i} className="flex items-start gap-3 py-2.5">
                    <span
                      className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        ACTION_COLORS[event.action] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {event.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        <span className="font-medium">{event.actorName ?? event.actor?.name ?? 'System'}</span>
                        {' '}
                        <span className="text-muted-foreground">
                          {event.entityType
                            ? `on ${event.entityType.toLowerCase().replace(/_/g, ' ')}`
                            : ''}
                        </span>
                        {event.description ? (
                          <span className="text-muted-foreground"> — {event.description}</span>
                        ) : null}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {timeAgo(event.occurredAt ?? event.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IRN Failures */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <SectionHeader title="IRN Failures" />
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonLine key={i} />
                ))}
              </div>
            ) : irnFailures.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 py-4 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                No pending IRN failures
              </div>
            ) : (
              <div className="space-y-0 divide-y">
                {irnFailures.map((inv: any) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2.5 gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground font-mono">
                        {inv.invoiceNumber ?? inv.number ?? inv.id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.date
                          ? new Date(inv.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : inv.createdAt
                          ? new Date(inv.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </p>
                    </div>
                    <RetryIrnButton invoiceId={inv.id} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — 40% */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Rate Cards */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <SectionHeader title="Live Rates" />
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <SkeletonLine w="w-24" />
                    <SkeletonLine w="w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0 divide-y">
                {RATE_ORDER.filter((key) => rates[key] != null).map((key) => (
                  <div key={key} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-muted-foreground">{RATE_LABELS[key]}</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatRupees(rates[key])}{' '}
                      <span className="text-xs font-normal text-muted-foreground">/g</span>
                    </span>
                  </div>
                ))}
                {RATE_ORDER.every((k) => rates[k] == null) && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Rates not available
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Low Stock Items */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <SectionHeader title="Low Stock Items" />
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonLine key={i} />
                ))}
              </div>
            ) : lowStockItems.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 py-4 justify-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                All items stocked
              </div>
            ) : (
              <div className="space-y-0 divide-y">
                {lowStockItems.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2.5 gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {item.sku}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${
                        item.stockQty <= 1 ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      {item.stockQty}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
