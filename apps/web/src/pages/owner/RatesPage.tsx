import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  AlertTriangle, CheckCircle2, Clock, Download, Pencil, RefreshCw, ShieldAlert, X,
} from 'lucide-react';
import { useRateStore } from '../../stores/rate.store';
import { api } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RateRow {
  metal: string;
  purity: string;
  ratePerGram: number | null;
  snappedAt: string | null;
  source: string | null;
  manualToday: boolean;
  usable: boolean;
  problem: string | null;
}

interface RateStatus {
  provider: 'metals.dev' | 'goldapi.io' | 'demo' | 'manual';
  allowDemoRates: boolean;
  maxAgeHours: number;
  schedule: string | null;
  premiums: { goldPer10g: number; silverPer10g: number };
  maxChangePct: number;
  quota: { month: string; used: number; budget: number } | null;
  lastFetch: { at: string; ok: boolean; trigger: string; message: string } | null;
  pending: { rates: Record<string, number>; previous: Record<string, number>; fetchedAt: string; changePct: number } | null;
  rates: RateRow[];
}

type SyncResult = { status: 'applied' | 'pending' | 'skipped' | 'error'; message: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const PURITY_COLORS: Record<string, string> = {
  GOLD_24K: '#f59e0b', GOLD_22K: '#d97706', GOLD_18K: '#b45309', GOLD_14K: '#92400e',
  SILVER_999: '#6b7280', SILVER_925: '#9ca3af', PLATINUM_950: '#64748b',
};

const PURITIES = [
  { purity: 'GOLD_24K', label: 'Gold 24K', fineness: 1 },
  { purity: 'GOLD_22K', label: 'Gold 22K', fineness: 0.916 },
  { purity: 'GOLD_18K', label: 'Gold 18K', fineness: 0.75 },
  { purity: 'GOLD_14K', label: 'Gold 14K', fineness: 0.585 },
  { purity: 'SILVER_999', label: 'Silver 999', fineness: 1 },
  { purity: 'SILVER_925', label: 'Silver 925', fineness: 0.925 },
  { purity: 'PLATINUM_950', label: 'Platinum 950', fineness: 1 },
];
const LABEL = Object.fromEntries(PURITIES.map((p) => [p.purity, p.label]));
const BILLING_CRITICAL = ['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'SILVER_999'];

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  'metals.dev': { label: 'Live · IBJA/MCX', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  'goldapi.io': { label: 'Live · spot', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  manual: { label: 'Manual', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' },
  mock: { label: 'Demo', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  base: { label: 'Demo', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const unwrap = (r: any) => r.data?.data ?? r.data;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const errMsg = (e: any) => e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function formatIST(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RatesPage() {
  const qc = useQueryClient();
  const { rates: liveRates, connect } = useRateStore();
  const [selectedPurity, setSelectedPurity] = useState('GOLD_22K');
  const [editing, setEditing] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  const statusQuery = useQuery<RateStatus>({
    queryKey: ['rate-status'],
    queryFn: () => api.get('/rates/status').then(unwrap),
    refetchInterval: 60_000,
  });
  const status = statusQuery.data;

  // Refresh status when the socket pushes a new rate
  const liveStamp = useMemo(() => Object.values(liveRates).map((r) => r.snappedAt).sort().pop(), [liveRates]);
  useEffect(() => { if (liveStamp) qc.invalidateQueries({ queryKey: ['rate-status'] }); }, [liveStamp, qc]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['rate-status'] });
    qc.invalidateQueries({ queryKey: ['rateHistory'] });
  };

  const fetchNow = useMutation({
    mutationFn: () => api.post('/rates/fetch-now').then(unwrap) as Promise<SyncResult>,
    onSuccess: (r) => {
      const fn = r.status === 'applied' ? toast.success : r.status === 'pending' ? toast.warning : r.status === 'skipped' ? toast.info : toast.error;
      fn(r.message);
      refreshAll();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const approve = useMutation({
    mutationFn: () => api.post('/rates/pending/approve'),
    onSuccess: () => { toast.success('Fetched rates applied'); refreshAll(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reject = useMutation({
    mutationFn: () => api.post('/rates/pending/reject'),
    onSuccess: () => { toast.info('Fetched rates discarded — current rates kept'); refreshAll(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const { data: historyData } = useQuery({
    queryKey: ['rateHistory', selectedPurity],
    queryFn: () => {
      const metal = selectedPurity.startsWith('SILVER') ? 'SILVER' : selectedPurity.startsWith('PLATINUM') ? 'PLATINUM' : 'GOLD';
      const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
      return api.get(`/rates/history/${metal}/${selectedPurity}?from=${from}&limit=100`).then((r: any) => r.data?.data ?? r.data);
    },
  });

  const chartData = (historyData?.rows ?? [])
    .filter((snap: any) => status?.allowDemoRates || !['mock', 'base'].includes(snap.source))
    .slice().reverse()
    .map((snap: any) => ({
      time: new Date(snap.snappedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      rate: Number(snap.ratePerGram) * 10,
    }));

  const rows = status?.rates ?? [];
  const blocking = rows.filter((r) => BILLING_CRITICAL.includes(r.purity) && !r.usable);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Metal Rates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Billing, the catalogue, the Share Kit and WhatsApp replies all use these rates. Shown per 10 g.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 border bg-card hover:bg-muted/50 text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Pencil className="w-4 h-4" /> {editing ? 'Close' : 'Set rates manually'}
          </button>
          {status?.provider === 'metals.dev' && (
            <button
              onClick={() => fetchNow.mutate()}
              disabled={fetchNow.isPending}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium px-3 py-2 rounded-lg"
            >
              <Download className={`w-4 h-4 ${fetchNow.isPending ? 'animate-pulse' : ''}`} /> Fetch latest now
            </button>
          )}
        </div>
      </div>

      {/* Billing blocked */}
      {blocking.length > 0 && (
        <div className="flex gap-3 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-800 dark:text-red-300">Billing is blocked for {blocking.map((r) => LABEL[r.purity]).join(', ')}</p>
            <p className="text-red-700 dark:text-red-400 mt-0.5">{blocking[0].problem}</p>
            <p className="text-red-700 dark:text-red-400 mt-1">
              {status?.provider === 'metals.dev'
                ? 'Click "Fetch latest now" or set the rates manually.'
                : <>Add your metals.dev key in <Link to="/owner/settings" className="underline underline-offset-2 font-medium">Settings → Live rates</Link>, or set the rates manually.</>}
            </p>
          </div>
        </div>
      )}

      {/* Pending approval */}
      {status?.pending && (
        <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-4 space-y-3">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                New rates moved {status.pending.changePct.toFixed(1)}%, more than your {status.maxChangePct}% limit. Approve them?
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                Fetched {formatIST(status.pending.fetchedAt)}. Current rates stay in use until you approve.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm min-w-[360px]">
              <thead>
                <tr className="text-xs text-amber-800/80 dark:text-amber-300/80">
                  <th className="text-left font-medium pr-6 py-1">Purity</th>
                  <th className="text-right font-medium pr-6 py-1">Current /10 g</th>
                  <th className="text-right font-medium py-1">Fetched /10 g</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {Object.entries(status.pending.rates).map(([purity, v]) => {
                  const prev = status.pending!.previous[purity];
                  return (
                    <tr key={purity}>
                      <td className="pr-6 py-0.5">{LABEL[purity] ?? purity}</td>
                      <td className="text-right pr-6 py-0.5">{prev ? inr(prev * 10) : '—'}</td>
                      <td className="text-right py-0.5 font-semibold">{inr(v * 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              <CheckCircle2 className="w-4 h-4" /> Approve &amp; apply
            </button>
            <button
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              className="inline-flex items-center gap-1.5 border bg-card hover:bg-muted/50 text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              <X className="w-4 h-4" /> Keep current rates
            </button>
          </div>
        </div>
      )}

      {/* Source / status line */}
      {status && <SourceStatus status={status} />}

      {/* Manual entry */}
      {editing && status && (
        <ManualRatesForm
          rows={rows}
          onSaved={() => { setEditing(false); refreshAll(); }}
        />
      )}

      {/* Rate cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {PURITIES.map(({ purity, label }) => {
          const r = rows.find((x) => x.purity === purity);
          const live = liveRates[`${r?.metal}:${purity}`];
          const perGram = live?.ratePerGram ?? r?.ratePerGram ?? null;
          const source = live?.source ?? r?.source ?? null;
          const badge = source ? SOURCE_BADGE[source] : null;
          return (
            <button
              key={purity}
              onClick={() => setSelectedPurity(purity)}
              className={`text-left bg-card rounded-xl border p-3.5 transition-all ${
                selectedPurity === purity ? 'border-amber-500 ring-1 ring-amber-400' : 'hover:border-amber-300'
              } ${r && !r.usable ? 'border-red-300 dark:border-red-900' : ''}`}
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                {perGram != null ? inr(perGram * 10) : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                per 10 g{perGram != null ? ` · ${inr(perGram)}/g` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {badge && <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>}
                {r && !r.usable && source && !['mock', 'base'].includes(source) && (
                  <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Stale</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(live?.snappedAt ?? r?.snappedAt ?? null)}</p>
            </button>
          );
        })}
      </div>

      {/* History chart */}
      <div className="bg-card rounded-xl border p-5">
        <h2 className="font-semibold mb-4">
          30-day history: {LABEL[selectedPurity]} <span className="text-muted-foreground font-normal text-sm">(per 10 g)</span>
        </h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} width={90} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: any) => [inr(Number(v)), 'Rate /10 g']} />
              <Line type="monotone" dataKey="rate" stroke={PURITY_COLORS[selectedPurity] ?? '#d97706'} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground/60 text-sm">No rate history yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Source status ──────────────────────────────────────────────────────────────

function SourceStatus({ status }: { status: RateStatus }) {
  const { provider, lastFetch, quota, schedule, premiums } = status;
  return (
    <div className="bg-card border rounded-xl px-4 py-3 text-sm flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span>
          <span className="text-muted-foreground">Source: </span>
          <span className="font-medium">
            {provider === 'metals.dev' && 'metals.dev (IBJA gold, MCX silver)'}
            {provider === 'goldapi.io' && 'goldapi.io (international spot)'}
            {provider === 'demo' && 'Demo rates (development only)'}
            {provider === 'manual' && 'Manual entry'}
          </span>
        </span>
        {provider === 'metals.dev' && (
          <span>
            <span className="text-muted-foreground">Patna premium: </span>
            <span className="font-medium tabular-nums">
              gold {premiums.goldPer10g >= 0 ? '+' : ''}{inr(premiums.goldPer10g)}/10 g, silver {premiums.silverPer10g >= 0 ? '+' : ''}{inr(premiums.silverPer10g)}/10 g
            </span>
          </span>
        )}
        {quota && (
          <span>
            <span className="text-muted-foreground">Free quota this month: </span>
            <span className={`font-medium tabular-nums ${quota.used >= quota.budget * 0.9 ? 'text-red-600' : ''}`}>{quota.used} / {quota.budget}</span>
          </span>
        )}
      </div>
      {schedule && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Automatic updates at {schedule}. Manual rates override fetched ones until midnight.
        </p>
      )}
      {lastFetch && (
        <p className={`text-xs flex items-start gap-1.5 ${lastFetch.ok ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
          {lastFetch.ok ? <RefreshCw className="w-3.5 h-3.5 mt-px shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />}
          <span>Last fetch {formatIST(lastFetch.at)} ({lastFetch.trigger}): {lastFetch.message}</span>
        </p>
      )}
      {provider !== 'metals.dev' && (
        <p className="text-xs text-muted-foreground">
          To update rates automatically, add a free metals.dev API key in{' '}
          <Link to="/owner/settings" className="underline underline-offset-2">Settings → Live rates</Link>.
        </p>
      )}
    </div>
  );
}

// ── Manual entry ───────────────────────────────────────────────────────────────

function ManualRatesForm({ rows, onSaved }: { rows: RateRow[]; onSaved: () => void }) {
  const initial = useMemo(() => Object.fromEntries(
    PURITIES.map(({ purity }) => {
      const r = rows.find((x) => x.purity === purity);
      const real = r?.ratePerGram != null && !['mock', 'base'].includes(r.source ?? '');
      return [purity, real ? String(Math.round(r!.ratePerGram! * 10)) : ''];
    }),
  ), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [values, setValues] = useState<Record<string, string>>(initial);
  const changed = PURITIES.filter(({ purity }) => values[purity] !== initial[purity] && values[purity].trim() !== '');

  const save = useMutation({
    mutationFn: () => api.post('/rates/manual', {
      rates: changed.map(({ purity }) => ({ purity, ratePer10g: Number(values[purity]) })),
    }),
    onSuccess: () => { toast.success(`Saved ${changed.length} rate${changed.length === 1 ? '' : 's'} for today`); onSaved(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  function deriveFrom(base: 'GOLD_24K' | 'SILVER_999') {
    const v = Number(values[base]);
    if (!v) { toast.info(`Enter ${LABEL[base]} first`); return; }
    const group = PURITIES.filter((p) => p.purity.split('_')[0] === base.split('_')[0] && p.purity !== base);
    setValues((s) => ({ ...s, ...Object.fromEntries(group.map((p) => [p.purity, String(Math.round(v * p.fineness))])) }));
  }

  const invalid = changed.some(({ purity }) => !(Number(values[purity]) > 0));

  return (
    <section className="bg-card border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Set today's rates (₹ per 10 g)</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Only the rates you change are saved. They are used for billing until midnight, even if new rates are fetched.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PURITIES.map(({ purity, label }) => {
          const isChanged = changed.some((c) => c.purity === purity);
          return (
            <label key={purity} className="space-y-1">
              <span className="text-sm font-medium flex items-center gap-1.5">
                {label}
                {isChanged && <span className="text-[10px] font-semibold text-violet-700 bg-violet-100 rounded px-1">changed</span>}
              </span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={values[purity]}
                  onChange={(e) => setValues((s) => ({ ...s, [purity]: e.target.value }))}
                  className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="per 10 g"
                />
              </div>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => deriveFrom('GOLD_24K')} className="text-xs border rounded-lg px-2.5 py-1.5 hover:bg-muted/50">
          Fill 22K/18K/14K from 24K
        </button>
        <button onClick={() => deriveFrom('SILVER_999')} className="text-xs border rounded-lg px-2.5 py-1.5 hover:bg-muted/50">
          Fill 925 from 999
        </button>
        <div className="flex-1" />
        <button
          onClick={() => save.mutate()}
          disabled={changed.length === 0 || invalid || save.isPending}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          Save {changed.length > 0 ? `${changed.length} rate${changed.length === 1 ? '' : 's'}` : 'rates'}
        </button>
      </div>
    </section>
  );
}
