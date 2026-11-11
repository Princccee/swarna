import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Printer, Store, Undo2, Wallet, Loader2, AlertTriangle, CheckCircle2, Ban, FileText,
} from 'lucide-react';
import { Role } from '@svarna/shared-types';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import {
  dateIN, errMsg, grams, inr, Loan, MODE_LABEL, MODES, openPdf, PURITY_LABEL, StatusBadges, unwrap, useLendingBase,
} from './lending-shared';

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const toIso = (ymd: string) => new Date(`${ymd}T12:00:00+05:30`).toISOString();

interface Split {
  months: number; interestDue: number; totalDue: number;
  amount: number; interestPart: number; principalPart: number; principalAfter: number;
  closesLoan: boolean; blockedByMerchant: boolean;
}

export default function LendingDetailPage() {
  const { id = '' } = useParams();
  const base = useLendingBase();
  const qc = useQueryClient();
  const isOwner = useAuthStore((s) => s.user?.role) === Role.OWNER;
  const canAct = useAuthStore((s) => s.user?.role) !== Role.ACCOUNTANT;

  const { data: loan, isLoading, error } = useQuery<Loan>({
    queryKey: ['lending', 'loan', id],
    queryFn: () => api.get(`/lending/loans/${id}`).then(unwrap),
  });

  const refresh = (l?: Loan) => {
    if (l) qc.setQueryData(['lending', 'loan', id], l);
    qc.invalidateQueries({ queryKey: ['lending'] });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>;
  if (error || !loan) return <div className="p-6 text-red-600">{errMsg(error) || 'Loan not found'}</div>;

  const active = loan.status === 'ACTIVE';
  const livePayments = loan.payments.filter((p) => !p.reversedAt);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <Link to={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Lending
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold font-mono">{loan.loanNumber}</h1>
              <StatusBadges loan={loan} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground">{loan.customer.name}</span> · {loan.customer.phone}
              {loan.customer.address ? ` · ${loan.customer.address}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              Given {dateIN(loan.loanDate)} · {inr(loan.principalOriginal)} at {loan.monthlyRatePct}% per month
              {loan.ltvPct != null ? ` · ${loan.ltvPct}% of value` : ''} · {MODE_LABEL[loan.disbursedMode] ?? loan.disbursedMode}
            </p>
          </div>
          <button
            onClick={() => openPdf(`/lending/loans/${loan.id}/slip.pdf`)}
            className="inline-flex items-center gap-1.5 border bg-card hover:bg-muted/50 text-sm font-medium px-3 py-2 rounded-lg self-start"
          >
            <Printer className="w-4 h-4" /> Print slip
          </button>
        </div>
      </div>

      {loan.overdue && (
        <div className="flex gap-2 text-sm border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          This loan is {loan.monthsRunning} months old and overdue. Contact the customer, or close it as forfeited below.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-5 min-w-0">
          {/* Due today */}
          {active && loan.due && (
            <section className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Due today</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Loan amount</p>
                  <p className="text-lg font-semibold tabular-nums">{inr(loan.principal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Interest</p>
                  <p className="text-lg font-semibold tabular-nums">{inr(loan.due.interestDue)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {loan.due.months} month{loan.due.months === 1 ? '' : 's'} × {inr(Math.round(loan.principal * loan.monthlyRatePct / 100))}
                    {' '}since {dateIN(loan.interestStartDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total to close</p>
                  <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{inr(loan.due.totalDue)}</p>
                </div>
              </div>
            </section>
          )}

          {!active && (
            <section className="bg-card border rounded-xl p-5 text-sm">
              {loan.status === 'REDEEMED' && <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Fully repaid on {dateIN(loan.closedAt)}. Item(s) returned to the customer.</p>}
              {loan.status === 'FORFEITED' && (
                <p className="flex items-center gap-2"><Ban className="w-4 h-4 text-muted-foreground" />
                  Closed as forfeited on {dateIN(loan.closedAt)}: item {loan.forfeitOutcome === 'SOLD' ? 'sold' : 'kept by the shop'}.
                  {loan.forfeitNotes ? ` ${loan.forfeitNotes}` : ''}
                </p>
              )}
            </section>
          )}

          {/* Items */}
          <section className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-3">Items</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium py-1.5">Description</th>
                    <th className="text-left font-medium py-1.5">Purity</th>
                    <th className="text-right font-medium py-1.5">Gross</th>
                    <th className="text-right font-medium py-1.5">Net</th>
                    <th className="text-right font-medium py-1.5">Value at loan</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {loan.items.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2">{i.description}</td>
                      <td className="py-2">{PURITY_LABEL[i.purity] ?? i.purity}</td>
                      <td className="py-2 text-right">{grams(i.grossWeightG)}</td>
                      <td className="py-2 text-right">{grams(i.netWeightG)}</td>
                      <td className="py-2 text-right">{inr(i.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loan.notes && <p className="text-sm text-muted-foreground mt-3">Notes: {loan.notes}</p>}
          </section>

          {/* Payments */}
          <section className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Payments</h2>
              {isOwner && livePayments.length > 0 && loan.status !== 'FORFEITED' && <ReverseLatest loanId={loan.id} onDone={refresh} />}
            </div>
            {loan.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium py-1.5">Date</th>
                      <th className="text-right font-medium py-1.5">Paid</th>
                      <th className="text-right font-medium py-1.5">Interest</th>
                      <th className="text-right font-medium py-1.5">Towards loan</th>
                      <th className="text-right font-medium py-1.5">Loan after</th>
                      <th className="text-left font-medium py-1.5 pl-3">Mode</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y tabular-nums">
                    {loan.payments.map((p) => (
                      <tr key={p.id} className={p.reversedAt ? 'opacity-50 line-through' : ''}>
                        <td className="py-2">{dateIN(p.paidAt)}</td>
                        <td className="py-2 text-right font-medium">{inr(p.amount)}</td>
                        <td className="py-2 text-right">{inr(p.interestPart)} <span className="text-xs text-muted-foreground">({p.monthsCharged} mo)</span></td>
                        <td className="py-2 text-right">{inr(p.principalPart)}</td>
                        <td className="py-2 text-right">{inr(p.principalAfter)}</td>
                        <td className="py-2 pl-3">{MODE_LABEL[p.mode] ?? p.mode}{p.reversedAt ? ' · reversed' : ''}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => openPdf(`/lending/loans/${loan.id}/payments/${p.id}/receipt.pdf`)}
                            className="text-muted-foreground hover:text-foreground no-underline"
                            title="Print receipt"
                            style={{ textDecoration: 'none' }}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Merchant history */}
          {loan.pledges.length > 0 && (
            <section className="bg-card border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Merchant history</h2>
              <ul className="space-y-2 text-sm">
                {loan.pledges.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 border rounded-lg px-3 py-2">
                    <span>
                      <span className="font-medium">{p.merchantName}</span>
                      {p.merchantPhone ? <span className="text-muted-foreground"> · {p.merchantPhone}</span> : null}
                      <span className="text-muted-foreground"> · {inr(p.amount)} received {dateIN(p.pledgedAt)}</span>
                    </span>
                    <span className={p.returnedAt ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400 font-medium'}>
                      {p.returnedAt ? `Back ${dateIN(p.returnedAt)}` : 'Still with merchant'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Actions */}
        {active && canAct && (
          <div className="space-y-5 min-w-0 lg:sticky lg:top-4 self-start">
            <TakePayment loan={loan} isOwner={isOwner} onDone={refresh} />
            <MerchantPanel loan={loan} isOwner={isOwner} onDone={refresh} />
            {loan.overdue && <ForfeitPanel loan={loan} onDone={refresh} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Take payment ──────────────────────────────────────────────────────────────

function TakePayment({ loan, isOwner, onDone }: { loan: Loan; isOwner: boolean; onDone: (l?: Loan) => void }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayIST());
  const [preview, setPreview] = useState<Split | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  const body = () => ({
    amount: Number(amount),
    mode,
    ...(reference.trim() ? { reference: reference.trim() } : {}),
    ...(isOwner && date !== todayIST() ? { paidAt: toIso(date) } : {}),
  });

  useEffect(() => {
    setPreview(null); setPreviewErr(null);
    if (!(Number(amount) > 0)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const s = await api.post(`/lending/loans/${loan.id}/payments/preview`, body()).then(unwrap);
        if (!cancelled) setPreview(s);
      } catch (e) {
        if (!cancelled) setPreviewErr(errMsg(e));
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amount, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: () => api.post(`/lending/loans/${loan.id}/payments`, body()).then(unwrap) as Promise<{ paymentId: string; loan: Loan }>,
    onSuccess: (r) => {
      toast.success(r.loan.status === 'REDEEMED' ? 'Loan fully repaid — return the item(s) to the customer' : 'Payment recorded');
      setAmount(''); setReference('');
      onDone(r.loan);
      openPdf(`/lending/loans/${loan.id}/payments/${r.paymentId}/receipt.pdf`);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const due = loan.due!;
  return (
    <section className="bg-card border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4" /> Take payment</h2>
      <div className="flex flex-wrap gap-1.5">
        {due.interestDue > 0 && (
          <button onClick={() => setAmount(String(due.interestDue))} className="text-xs border rounded-full px-2.5 py-1 hover:bg-muted/50">
            Interest only · {inr(due.interestDue)}
          </button>
        )}
        <button onClick={() => setAmount(String(due.totalDue))} className="text-xs border rounded-full px-2.5 py-1 hover:bg-muted/50">
          Close loan · {inr(due.totalDue)}
        </button>
      </div>
      <label className="space-y-1 text-sm block">
        <span className="font-medium">Amount (₹)</span>
        <input type="number" min="1" step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          className={`${inputCls} tabular-nums text-base font-semibold`} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Date</span>
          <input type="date" value={date} max={todayIST()} disabled={!isOwner} onChange={(e) => setDate(e.target.value)}
            className={`${inputCls} disabled:opacity-60`} />
        </label>
      </div>
      {mode !== 'CASH' && (
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (UPI / cheque no.)" className={inputCls} />
      )}

      {preview && (
        <div className="text-sm bg-muted/30 rounded-lg px-3 py-2.5 space-y-1 tabular-nums">
          <div className="flex justify-between"><span className="text-muted-foreground">Interest ({preview.months} mo)</span><span>{inr(preview.interestPart)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Towards loan</span><span>{inr(preview.principalPart)}</span></div>
          <div className="flex justify-between font-semibold border-t pt-1"><span>Loan after</span><span>{inr(preview.principalAfter)}</span></div>
          {preview.closesLoan && !preview.blockedByMerchant && <p className="text-emerald-700 dark:text-emerald-400 text-xs pt-1">This closes the loan. Return the item(s).</p>}
          {preview.blockedByMerchant && <p className="text-red-600 text-xs pt-1">The item is with a merchant. Mark it returned before closing.</p>}
        </div>
      )}
      {previewErr && <p className="text-sm text-red-600">{previewErr}</p>}

      <button
        onClick={() => pay.mutate()}
        disabled={!preview || preview.blockedByMerchant || pay.isPending}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
      >
        {pay.isPending ? 'Saving…' : `Record ${Number(amount) > 0 ? inr(Number(amount)) : 'payment'} & print receipt`}
      </button>
    </section>
  );
}

// ── Merchant ──────────────────────────────────────────────────────────────────

function MerchantPanel({ loan, isOwner, onDone }: { loan: Loan; isOwner: boolean; onDone: (l?: Loan) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ merchantName: '', merchantPhone: '', amount: '', date: todayIST(), notes: '' });

  const pledge = useMutation({
    mutationFn: () => api.post(`/lending/loans/${loan.id}/merchant`, {
      merchantName: f.merchantName.trim(),
      amount: Number(f.amount),
      ...(f.merchantPhone.trim() ? { merchantPhone: f.merchantPhone.trim() } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
      ...(isOwner && f.date !== todayIST() ? { pledgedAt: toIso(f.date) } : {}),
    }).then(unwrap) as Promise<Loan>,
    onSuccess: (l) => { toast.success('Recorded: item is with the merchant'); setOpen(false); onDone(l); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const back = useMutation({
    mutationFn: () => api.post(`/lending/loans/${loan.id}/merchant/return`, {}).then(unwrap) as Promise<Loan>,
    onSuccess: (l) => { toast.success('Item is back in the shop'); onDone(l); },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (loan.activePledge) {
    const p = loan.activePledge;
    return (
      <section className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Store className="w-4 h-4" /> With merchant</h2>
        <p className="text-sm">
          <span className="font-medium">{p.merchantName}</span>{p.merchantPhone ? ` · ${p.merchantPhone}` : ''}<br />
          <span className="text-muted-foreground">{inr(p.amount)} received on {dateIN(p.pledgedAt)}</span>
        </p>
        <button
          onClick={() => back.mutate()}
          disabled={back.isPending}
          className="w-full border border-amber-400 bg-card hover:bg-muted/50 text-sm font-medium px-4 py-2 rounded-lg"
        >
          Got it back from the merchant
        </button>
      </section>
    );
  }

  return (
    <section className="bg-card border rounded-xl p-5 space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between font-semibold">
        <span className="flex items-center gap-2"><Store className="w-4 h-4" /> Pledge to a merchant</span>
        <span className="text-xs font-normal text-muted-foreground">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="space-y-2">
          <input value={f.merchantName} onChange={(e) => setF({ ...f, merchantName: e.target.value })} placeholder="Merchant name" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={f.merchantPhone} onChange={(e) => setF({ ...f, merchantPhone: e.target.value })} placeholder="Phone (optional)" className={inputCls} />
            <input type="number" min="1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount received ₹" className={`${inputCls} tabular-nums`} />
          </div>
          <input type="date" value={f.date} max={todayIST()} disabled={!isOwner} onChange={(e) => setF({ ...f, date: e.target.value })} className={`${inputCls} disabled:opacity-60`} />
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" className={inputCls} />
          <button
            onClick={() => pledge.mutate()}
            disabled={f.merchantName.trim().length < 2 || !(Number(f.amount) > 0) || pledge.isPending}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Record pledge
          </button>
        </div>
      )}
    </section>
  );
}

// ── Forfeit ───────────────────────────────────────────────────────────────────

function ForfeitPanel({ loan, onDone }: { loan: Loan; onDone: (l?: Loan) => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<'KEPT' | 'SOLD'>('KEPT');
  const [notes, setNotes] = useState('');
  const [sure, setSure] = useState(false);
  const forfeit = useMutation({
    mutationFn: () => api.post(`/lending/loans/${loan.id}/forfeit`, { outcome, ...(notes.trim() ? { notes: notes.trim() } : {}) }).then(unwrap) as Promise<Loan>,
    onSuccess: (l) => { toast.success('Loan closed as forfeited'); onDone(l); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <section className="bg-card border border-red-200 dark:border-red-900 rounded-xl p-5 space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between font-semibold text-red-700 dark:text-red-400">
        <span className="flex items-center gap-2"><Ban className="w-4 h-4" /> Close as forfeited</span>
        <span className="text-xs font-normal text-muted-foreground">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Use this only if the customer won't repay. The loan closes without a payment.</p>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as 'KEPT' | 'SOLD')} className={inputCls}>
            <option value="KEPT">Item kept by the shop</option>
            <option value="SOLD">Item sold</option>
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (e.g. customer informed on…)" className={inputCls} />
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 accent-red-600" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            <span>I confirm the customer gave up this item ({inr(loan.due?.totalDue)} outstanding).</span>
          </label>
          <button
            onClick={() => forfeit.mutate()}
            disabled={!sure || forfeit.isPending}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg"
          >
            Close loan as forfeited
          </button>
        </div>
      )}
    </section>
  );
}

// ── Reverse latest payment (owner) ────────────────────────────────────────────

function ReverseLatest({ loanId, onDone }: { loanId: string; onDone: (l?: Loan) => void }) {
  const [confirming, setConfirming] = useState(false);
  const reverse = useMutation({
    mutationFn: () => api.post(`/lending/loans/${loanId}/payments/reverse-latest`, {}).then(unwrap) as Promise<Loan>,
    onSuccess: (l) => { toast.success('Latest payment reversed'); setConfirming(false); onDone(l); },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Undo2 className="w-3.5 h-3.5" /> Reverse latest payment
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Undo the most recent payment?</span>
      <button onClick={() => reverse.mutate()} disabled={reverse.isPending} className="font-semibold text-red-600">Yes, reverse</button>
      <button onClick={() => setConfirming(false)} className="text-muted-foreground">No</button>
    </span>
  );
}
