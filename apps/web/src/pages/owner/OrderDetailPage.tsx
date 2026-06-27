import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../../lib/api';
import { toast } from 'sonner';

// ─── Constants ───────────────────────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<string, string> = {
  CUSTOM: 'Custom',
  REPAIR: 'Repair',
  BULK: 'Bulk',
};

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: 'Gold 24K',
  GOLD_22K: 'Gold 22K',
  GOLD_18K: 'Gold 18K',
  GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999',
  SILVER_925: 'Silver 925',
  PLATINUM_950: 'Platinum 950',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  MAKING: 'bg-amber-100 text-amber-700',
  READY: 'bg-green-100 text-green-700',
  INVOICED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'];

const KARIGAR_ENTRY_TYPES = ['ISSUED', 'RETURNED'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  description: string | null;
  metalPurity: string | null;
  estimatedWeightG: number | null;
  estimatedValue: number | null;
  notes: string | null;
  assignedTo: string | null;
  expectedReadyDate: string | null;
  invoiceId: string | null;
  customer: { name: string; phone: string } | null;
  payments: Payment[];
  karigarLogs: KarigarLog[];
}

interface Payment {
  id: string;
  mode: string;
  amount: number;
  createdAt: string;
}

interface KarigarLog {
  id: string;
  karigarUser: { name: string } | null;
  entryType: string;
  goldWeightG: number;
  notes: string | null;
  createdAt: string;
}

interface AddPaymentForm {
  amount: number;
  mode: string;
}

interface AddKarigarForm {
  karigarUserId: string;
  entryType: string;
  goldWeightG: number;
  notes: string;
}

interface InvoiceForm {
  invoiceId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b  last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right">{value ?? '—'}</span>
    </div>
  );
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border  overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b ">
        <h2 className="font-semibold text-foreground text-sm uppercase tracking-wide">{title}</h2>
        {action && <div>{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

interface StatusTimelineProps {
  status: string;
  orderId: string;
}

function StatusTimeline({ status, orderId }: StatusTimelineProps) {
  const qc = useQueryClient();
  const [showInvoiceInput, setShowInvoiceInput] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<InvoiceForm>();

  const statusMutation = useMutation({
    mutationFn: (body: { status: string; invoiceId?: string }) =>
      api.patch(`/orders/${orderId}/status`, body).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Order status updated');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      setShowInvoiceInput(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update status'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/orders/${orderId}/cancel`).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Order cancelled');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to cancel order'),
  });

  const onInvoiceSubmit = (data: InvoiceForm) => {
    statusMutation.mutate({ status: 'INVOICED', invoiceId: data.invoiceId });
  };

  const steps = ['DRAFT', 'CONFIRMED', 'MAKING', 'READY', 'INVOICED'];
  const cancelledOrDone = status === 'CANCELLED' || status === 'INVOICED';
  const currentIdx = steps.indexOf(status);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const done = i < currentIdx || status === 'INVOICED';
          const active = step === status && status !== 'CANCELLED';
          return (
            <div key={step} className="flex items-center flex-1">
              <div className={`h-2 flex-1 rounded-sm ${i === 0 ? 'rounded-l-full' : ''} ${i === steps.length - 1 ? 'rounded-r-full' : ''} ${
                done || active ? (status === 'CANCELLED' ? 'bg-red-300' : 'bg-amber-500') : 'bg-muted'
              }`} />
              {i < steps.length - 1 && <div className="w-0.5 h-2 bg-card" />}
            </div>
          );
        })}
      </div>
      <div className="flex">
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = step === status;
          return (
            <div key={step} className="flex-1 text-center">
              <span className={`text-xs ${active ? 'font-semibold text-amber-700' : done ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                {step.charAt(0) + step.slice(1).toLowerCase().replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      {!cancelledOrDone && (
        <div className="flex flex-wrap gap-2 pt-1">
          {status === 'DRAFT' && (
            <>
              <button
                onClick={() => statusMutation.mutate({ status: 'CONFIRMED' })}
                disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Confirm Order
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Cancel Order
              </button>
            </>
          )}
          {status === 'CONFIRMED' && (
            <>
              <button
                onClick={() => statusMutation.mutate({ status: 'MAKING' })}
                disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                Start Making
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="px-4 py-2 text-sm font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Cancel Order
              </button>
            </>
          )}
          {status === 'MAKING' && (
            <button
              onClick={() => statusMutation.mutate({ status: 'READY' })}
              disabled={statusMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Mark Ready
            </button>
          )}
          {status === 'READY' && !showInvoiceInput && (
            <button
              onClick={() => setShowInvoiceInput(true)}
              className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Mark Invoiced
            </button>
          )}
          {status === 'READY' && showInvoiceInput && (
            <form onSubmit={handleSubmit(onInvoiceSubmit)} className="flex items-start gap-2 flex-wrap">
              <div>
                <input
                  {...register('invoiceId', { required: 'Invoice ID is required' })}
                  placeholder="Invoice ID"
                  className="border  rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {errors.invoiceId && (
                  <p className="text-xs text-red-500 mt-1">{errors.invoiceId.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={statusMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Confirm Invoice
              </button>
              <button
                type="button"
                onClick={() => { setShowInvoiceInput(false); reset(); }}
                className="px-4 py-2 text-sm font-medium border  text-muted-foreground rounded-lg hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {status === 'CANCELLED' && (
        <p className="text-sm text-red-500 font-medium">This order has been cancelled.</p>
      )}
      {status === 'INVOICED' && (
        <p className="text-sm text-emerald-600 font-medium">This order has been invoiced and completed.</p>
      )}
    </div>
  );
}

// ─── Add Payment Form ─────────────────────────────────────────────────────────

interface AddPaymentFormProps {
  orderId: string;
  onDone: () => void;
}

function AddPaymentForm({ orderId, onDone }: AddPaymentFormProps) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddPaymentForm>({
    defaultValues: { mode: 'CASH' },
  });

  const mutation = useMutation({
    mutationFn: (data: AddPaymentForm) =>
      api.post(`/orders/${orderId}/payments`, { ...data, amount: Number(data.amount) }).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      reset();
      onDone();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to add payment'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-4 p-4 bg-muted/50 rounded-lg border  space-y-3">
      <p className="text-sm font-semibold text-foreground/80">Add Payment</p>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Amount (₹)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be > 0' } })}
            className="border  rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="0.00"
          />
          {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Mode</label>
          <select
            {...register('mode', { required: true })}
            className="border  rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          Save Payment
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm font-medium border  text-muted-foreground rounded-lg hover:bg-muted/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Karigar Log Form ─────────────────────────────────────────────────────────

interface KarigarLogFormProps {
  orderId: string;
  onDone: () => void;
}

function KarigarLogForm({ orderId, onDone }: KarigarLogFormProps) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddKarigarForm>({
    defaultValues: { entryType: 'ISSUED' },
  });

  const mutation = useMutation({
    mutationFn: (data: AddKarigarForm) =>
      api.post(`/orders/${orderId}/karigar`, {
        karigarUserId: data.karigarUserId,
        entryType: data.entryType,
        goldWeightG: Number(data.goldWeightG),
        notes: data.notes || undefined,
      }).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Karigar log entry added');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      reset();
      onDone();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to log entry'),
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-4 p-4 bg-muted/50 rounded-lg border  space-y-3">
      <p className="text-sm font-semibold text-foreground/80">Log Karigar Entry</p>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Karigar User ID</label>
          <input
            {...register('karigarUserId', { required: 'Karigar User ID is required' })}
            placeholder="UUID"
            className="border  rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
          />
          {errors.karigarUserId && <p className="text-xs text-red-500 mt-1">{errors.karigarUserId.message}</p>}
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Entry Type</label>
          <select
            {...register('entryType', { required: true })}
            className="border  rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {KARIGAR_ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Gold Weight (g)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            {...register('goldWeightG', { required: 'Weight is required', min: { value: 0.001, message: 'Must be > 0' } })}
            placeholder="0.000"
            className="border  rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {errors.goldWeightG && <p className="text-xs text-red-500 mt-1">{errors.goldWeightG.message}</p>}
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
        <input
          {...register('notes')}
          placeholder="Any notes…"
          className="border  rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          Save Entry
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm font-medium border  text-muted-foreground rounded-lg hover:bg-muted/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showKarigarForm, setShowKarigarForm] = useState(false);

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((r: any) => r.data.data ?? r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-5 text-sm">
          Order not found or failed to load.{' '}
          <button onClick={() => navigate(-1)} className="underline">Go back</button>
        </div>
      </div>
    );
  }

  const totalPaid = (order.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const estimatedValue = Number(order.estimatedValue ?? 0);
  const balanceDue = estimatedValue - totalPaid;

  const totalIssued = (order.karigarLogs ?? [])
    .filter((l) => l.entryType === 'ISSUED')
    .reduce((s, l) => s + Number(l.goldWeightG), 0);
  const totalReturned = (order.karigarLogs ?? [])
    .filter((l) => l.entryType === 'RETURNED')
    .reduce((s, l) => s + Number(l.goldWeightG), 0);
  const goldBalance = totalIssued - totalReturned;

  return (
    <div className="p-6 space-y-5 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate(-1)}
              className="text-muted-foreground/60 hover:text-muted-foreground text-sm mr-1"
              aria-label="Back"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-bold text-foreground font-mono">{order.orderNumber}</h1>
            <Badge
              label={ORDER_TYPE_LABELS[order.type] ?? order.type}
              colorClass="bg-violet-100 text-violet-700"
            />
            <Badge
              label={order.status}
              colorClass={STATUS_COLORS[order.status] ?? 'bg-muted text-muted-foreground'}
            />
          </div>
          <div className="mt-1.5 text-sm text-muted-foreground space-x-3">
            {order.customer && (
              <>
                <span className="font-medium">{order.customer.name}</span>
                <span className="text-muted-foreground/60">{order.customer.phone}</span>
              </>
            )}
            {order.expectedReadyDate && (
              <span className="text-muted-foreground/60">
                Ready by <span className="text-foreground/80">{fmtDate(order.expectedReadyDate)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Timeline ── */}
      <SectionCard title="Status &amp; Actions">
        <StatusTimeline status={order.status} orderId={id!} />
      </SectionCard>

      {/* ── Order Details ── */}
      <SectionCard title="Order Details">
        <div className="space-y-0.5">
          <Row label="Description" value={order.description} />
          <Row label="Metal Purity" value={PURITY_LABELS[order.metalPurity ?? ''] ?? order.metalPurity} />
          <Row
            label="Estimated Weight"
            value={order.estimatedWeightG != null ? `${Number(order.estimatedWeightG).toFixed(3)} g` : null}
          />
          <Row
            label="Estimated Value"
            value={order.estimatedValue != null ? `₹${fmt(Number(order.estimatedValue))}` : null}
          />
          <Row label="Assigned To" value={order.assignedTo} />
          {order.invoiceId && <Row label="Invoice ID" value={<span className="font-mono text-xs">{order.invoiceId}</span>} />}
          <Row label="Notes" value={order.notes} />
        </div>
      </SectionCard>

      {/* ── Payments ── */}
      <SectionCard
        title="Payments"
        action={
          !showPaymentForm && order.status !== 'CANCELLED' ? (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="text-xs font-medium text-amber-700 hover:text-amber-800 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-50 transition-colors"
            >
              + Add Payment
            </button>
          ) : null
        }
      >
        {(order.payments ?? []).length === 0 && !showPaymentForm ? (
          <p className="text-sm text-muted-foreground/60">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="border-b ">
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Mode</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">Amount</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(order.payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs font-medium">
                        {p.mode.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium">₹{fmt(Number(p.amount))}</td>
                    <td className="py-2.5 text-right text-muted-foreground/60 text-xs">{fmtDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
              {(order.payments ?? []).length > 0 && (
                <tfoot>
                  <tr className="border-t ">
                    <td className="pt-2.5 text-xs font-semibold text-muted-foreground uppercase">Total Paid</td>
                    <td className="pt-2.5 text-right font-bold text-foreground">₹{fmt(totalPaid)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {showPaymentForm && (
          <AddPaymentForm orderId={id!} onDone={() => setShowPaymentForm(false)} />
        )}
      </SectionCard>

      {/* ── Karigar Gold Log ── */}
      <SectionCard
        title="Karigar Gold Log"
        action={
          !showKarigarForm && order.status !== 'CANCELLED' && order.status !== 'INVOICED' ? (
            <button
              onClick={() => setShowKarigarForm(true)}
              className="text-xs font-medium text-amber-700 hover:text-amber-800 border border-amber-200 px-3 py-1 rounded-lg hover:bg-amber-50 transition-colors"
            >
              + Log Entry
            </button>
          ) : null
        }
      >
        {(order.karigarLogs ?? []).length === 0 && !showKarigarForm ? (
          <p className="text-sm text-muted-foreground/60">No karigar gold entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="border-b ">
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Karigar</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Type</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">Weight (g)</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide pl-4">Notes</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(order.karigarLogs ?? []).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 text-foreground/80">{log.karigarUser?.name ?? <span className="text-muted-foreground/60 font-mono text-xs">unknown</span>}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.entryType === 'ISSUED'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {log.entryType.charAt(0) + log.entryType.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono">{Number(log.goldWeightG).toFixed(3)}</td>
                    <td className="py-2.5 pl-4 text-muted-foreground/60 text-xs">{log.notes ?? '—'}</td>
                    <td className="py-2.5 text-right text-muted-foreground/60 text-xs">{fmtDate(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
              {(order.karigarLogs ?? []).length > 0 && (
                <tfoot>
                  <tr className="border-t ">
                    <td colSpan={2} className="pt-2.5 text-xs font-semibold text-muted-foreground uppercase">Net Gold with Karigar</td>
                    <td className={`pt-2.5 text-right font-bold font-mono ${goldBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {goldBalance.toFixed(3)} g
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {showKarigarForm && (
          <KarigarLogForm orderId={id!} onDone={() => setShowKarigarForm(false)} />
        )}
      </SectionCard>

      {/* ── Balance Summary ── */}
      <SectionCard title="Balance Summary">
        <div className="space-y-0.5">
          <Row
            label="Advance Paid"
            value={<span className="text-green-600 font-semibold">₹{fmt(totalPaid)}</span>}
          />
          <Row
            label="Estimated Value"
            value={`₹${fmt(estimatedValue)}`}
          />
          <div className="border-t  pt-2 mt-2">
            <Row
              label="Balance Due"
              value={
                <span className={`text-base font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{fmt(Math.abs(balanceDue))}
                  {balanceDue < 0 && <span className="text-xs font-normal text-green-500 ml-1">(overpaid)</span>}
                </span>
              }
            />
          </div>
        </div>
      </SectionCard>

    </div>
  );
}
