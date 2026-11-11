import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Search, UserPlus, X, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { Role } from '@svarna/shared-types';
import {
  errMsg, inr, LENDABLE_PURITIES, Loan, MODE_LABEL, MODES, openPdf, PURITY_LABEL, unwrap, useLendingBase,
} from './lending-shared';

interface Customer { id: string; name: string; phone: string; address: string | null }

interface ItemRow { key: number; description: string; purity: string; grossWeightG: string; netWeightG: string }

interface Valuation {
  items: Array<{ ratePerGram: number | null; value: number | null; rateProblem: string | null }>;
  total: number | null;
  ltvPct: number;
  maxLtvPct: number;
  monthlyRatePct: number;
  suggestedAmount: number | null;
  maxAmount: number | null;
}

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';
let rowKey = 1;
const emptyRow = (): ItemRow => ({ key: rowKey++, description: '', purity: 'GOLD_22K', grossWeightG: '', netWeightG: '' });

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default function LendingNewPage() {
  const base = useLendingBase();
  const navigate = useNavigate();
  const isOwner = useAuthStore((s) => s.user?.role) === Role.OWNER;

  // Customer
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [nc, setNc] = useState({ name: '', phone: '', address: '' });
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const customers = useQuery<Customer[]>({
    queryKey: ['customers', q],
    queryFn: () => api.get('/billing/customers', { params: { search: q } }).then(unwrap),
    enabled: q.length >= 2 && !customer && !newMode,
  });

  // Items
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const updateItem = (key: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const validItems = useMemo(() => items
    .filter((r) => r.description.trim() && Number(r.netWeightG) > 0 && Number(r.grossWeightG) > 0)
    .map((r) => ({
      description: r.description.trim(), purity: r.purity,
      grossWeightG: Number(r.grossWeightG), netWeightG: Number(r.netWeightG),
    })), [items]);
  const itemsComplete = validItems.length === items.length && items.length > 0;
  const weightError = items.find((r) => Number(r.netWeightG) > Number(r.grossWeightG) && r.grossWeightG !== '');

  // Valuation
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [valuating, setValuating] = useState(false);
  const itemsKey = JSON.stringify(validItems);
  useEffect(() => {
    if (!itemsComplete || weightError) { setValuation(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setValuating(true);
      try {
        const v = await api.post('/lending/valuation', { items: validItems }).then(unwrap);
        if (!cancelled) setValuation(v);
      } catch {
        if (!cancelled) setValuation(null);
      } finally {
        if (!cancelled) setValuating(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [itemsKey, itemsComplete, weightError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Loan terms
  const [amount, setAmount] = useState('');
  const [amountEdited, setAmountEdited] = useState(false);
  const [rate, setRate] = useState('');
  const [loanDate, setLoanDate] = useState(todayIST());
  const [mode, setMode] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [confirmHigh, setConfirmHigh] = useState(false);

  useEffect(() => {
    if (valuation?.suggestedAmount != null && !amountEdited) setAmount(String(valuation.suggestedAmount));
    if (valuation && rate === '') setRate(String(valuation.monthlyRatePct));
  }, [valuation]); // eslint-disable-line react-hooks/exhaustive-deps

  const amt = Number(amount);
  const ltv = valuation?.total ? (amt / valuation.total) * 100 : null;
  const aboveMax = ltv != null && valuation != null && ltv > valuation.maxLtvPct;
  const monthlyInterest = amt > 0 && Number(rate) > 0 ? Math.round((amt * Number(rate)) / 100) : null;

  const customerOk = customer != null || (nc.name.trim().length >= 2 && /^\d{10}$/.test(nc.phone));
  const canSubmit = customerOk && itemsComplete && !weightError && amt >= 1 && Number(rate) > 0 && (!aboveMax || confirmHigh);

  const create = useMutation({
    mutationFn: () => api.post('/lending/loans', {
      ...(customer ? { customerId: customer.id } : {
        newCustomer: { name: nc.name.trim(), phone: nc.phone, ...(nc.address.trim() ? { address: nc.address.trim() } : {}) },
      }),
      items: validItems,
      amount: amt,
      monthlyRatePct: Number(rate),
      disbursedMode: mode,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(isOwner && loanDate !== todayIST() ? { loanDate: new Date(`${loanDate}T12:00:00+05:30`).toISOString() } : {}),
      ...(aboveMax ? { confirmAboveMaxLtv: true } : {}),
    }).then(unwrap) as Promise<Loan>,
    onSuccess: (loan) => {
      toast.success(`Loan ${loan.loanNumber} created`);
      navigate(`${base}/${loan.id}`);
      openPdf(`/lending/loans/${loan.id}/slip.pdf`);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
      <div>
        <Link to={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Lending
        </Link>
        <h1 className="text-2xl font-bold mt-2">New loan</h1>
      </div>

      {/* 1. Customer */}
      <section className="bg-card border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">1. Customer</h2>
        {customer ? (
          <div className="flex items-start justify-between gap-3 border rounded-lg px-3 py-2.5 bg-muted/30">
            <div className="text-sm">
              <div className="font-medium">{customer.name}</div>
              <div className="text-muted-foreground">{customer.phone}{customer.address ? ` · ${customer.address}` : ''}</div>
            </div>
            <button onClick={() => setCustomer(null)} className="text-muted-foreground hover:text-foreground" aria-label="Change customer">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : newMode ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} className={inputCls} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Phone</span>
                <input
                  value={nc.phone}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(e) => setNc({ ...nc, phone: e.target.value.replace(/\D/g, '') })}
                  className={inputCls}
                  placeholder="10-digit mobile"
                />
              </label>
            </div>
            <label className="space-y-1 text-sm block">
              <span className="font-medium">Address</span>
              <input value={nc.address} onChange={(e) => setNc({ ...nc, address: e.target.value })} className={inputCls} />
            </label>
            <button onClick={() => setNewMode(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Search existing customers instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone"
                className={`${inputCls} pl-9`}
              />
            </div>
            {customers.data && customers.data.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {customers.data.filter((c) => c.phone !== '0000000000').map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCustomer(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground"> · {c.phone}</span>
                  </button>
                ))}
              </div>
            )}
            {q.length >= 2 && customers.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No customer found.</p>
            )}
            <button
              onClick={() => { setNewMode(true); if (/^\d+$/.test(search)) setNc({ ...nc, phone: search.slice(0, 10) }); else setNc({ ...nc, name: search }); }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              <UserPlus className="w-4 h-4" /> Add new customer
            </button>
          </div>
        )}
      </section>

      {/* 2. Items */}
      <section className="bg-card border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">2. Items pledged</h2>
        <div className="space-y-3">
          {items.map((r, i) => {
            const v = valuation?.items[i];
            return (
              <div key={r.key} className="border rounded-lg p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-[2fr_1.2fr_1fr_1fr_auto] gap-2 items-end">
                  <label className="space-y-1 text-xs col-span-2 sm:col-span-1">
                    <span className="font-medium">Description</span>
                    <input value={r.description} onChange={(e) => updateItem(r.key, { description: e.target.value })} className={inputCls} placeholder="e.g. Gold chain" />
                  </label>
                  <label className="space-y-1 text-xs col-span-2 sm:col-span-1">
                    <span className="font-medium">Metal / purity</span>
                    <select value={r.purity} onChange={(e) => updateItem(r.key, { purity: e.target.value })} className={inputCls}>
                      {LENDABLE_PURITIES.map((p) => <option key={p} value={p}>{PURITY_LABEL[p]}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Gross wt (g)</span>
                    <input type="number" step="0.001" min="0" inputMode="decimal" value={r.grossWeightG}
                      onChange={(e) => updateItem(r.key, { grossWeightG: e.target.value })} className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-medium">Net wt (g)</span>
                    <input type="number" step="0.001" min="0" inputMode="decimal" value={r.netWeightG}
                      onChange={(e) => updateItem(r.key, { netWeightG: e.target.value })} className={`${inputCls} tabular-nums`} />
                  </label>
                  <button
                    onClick={() => setItems((rows) => rows.filter((x) => x.key !== r.key))}
                    disabled={items.length === 1}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-lg border text-muted-foreground hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {Number(r.netWeightG) > Number(r.grossWeightG) && r.grossWeightG !== '' && (
                  <p className="text-xs text-red-600">Net weight can't be more than gross weight.</p>
                )}
                {v && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {v.value != null
                      ? <>Value {inr(v.value)} <span className="opacity-70">({inr((v.ratePerGram ?? 0) * 10)}/10 g)</span></>
                      : <span className="text-amber-700">{v.rateProblem ?? 'No rate available'}</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setItems((rows) => [...rows, emptyRow()])}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
        >
          <Plus className="w-4 h-4" /> Add another item
        </button>
      </section>

      {/* 3. Loan */}
      <section className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">3. Loan</h2>
          {valuating && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {valuation?.total != null && (
          <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg px-4 py-3">
            <div><p className="text-xs text-muted-foreground">Total value</p><p className="font-semibold tabular-nums">{inr(valuation.total)}</p></div>
            <div><p className="text-xs text-muted-foreground">Suggested ({valuation.ltvPct}%)</p><p className="font-semibold tabular-nums">{inr(valuation.suggestedAmount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Maximum ({valuation.maxLtvPct}%)</p><p className="font-semibold tabular-nums">{inr(valuation.maxAmount)}</p></div>
          </div>
        )}
        {valuation && valuation.total == null && (
          <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Today's rate isn't available for every item, so no amount is suggested. Enter the amount yourself.
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Loan amount (₹)</span>
            <input
              type="number" min="1" step="1" inputMode="numeric"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountEdited(true); setConfirmHigh(false); }}
              className={`${inputCls} tabular-nums text-base font-semibold`}
            />
            {ltv != null && amt > 0 && (
              <span className={`text-xs ${aboveMax ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                {ltv.toFixed(1)}% of item value
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Interest (% per month)</span>
            <input type="number" min="0.01" step="0.05" value={rate} onChange={(e) => setRate(e.target.value)} className={`${inputCls} tabular-nums`} />
            {monthlyInterest != null && <span className="text-xs text-muted-foreground">{inr(monthlyInterest)} per month</span>}
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cash given by</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
              {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Loan date</span>
            <input
              type="date"
              value={loanDate}
              max={todayIST()}
              disabled={!isOwner}
              onChange={(e) => setLoanDate(e.target.value)}
              className={`${inputCls} disabled:opacity-60`}
            />
            <span className="text-xs text-muted-foreground">
              {isOwner ? 'Change only when entering an older loan.' : 'Only the owner can enter an earlier date.'}
            </span>
          </label>
        </div>
        <label className="space-y-1 text-sm block">
          <span className="font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </label>

        {aboveMax && (
          <label className="flex items-start gap-2 text-sm border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 accent-red-600" checked={confirmHigh} onChange={(e) => setConfirmHigh(e.target.checked)} />
            <span className="text-red-800 dark:text-red-300">
              This is {ltv!.toFixed(1)}% of the item value, above the {valuation!.maxLtvPct}% maximum. Give this amount anyway.
            </span>
          </label>
        )}
      </section>

      <div className="flex items-center justify-end gap-3 pb-6">
        <Link to={base} className="text-sm text-muted-foreground hover:text-foreground">Cancel</Link>
        <button
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
        >
          {create.isPending ? 'Saving…' : `Give loan${amt > 0 ? ` of ${inr(amt)}` : ''} & print slip`}
        </button>
      </div>
    </div>
  );
}
