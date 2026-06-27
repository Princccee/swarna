import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { downloadInvoicePdf } from '../../lib/download-pdf';
import { useAuthStore } from '../../stores/auth.store';
import { toast } from 'sonner';
import { Role } from '@svarna/shared-types';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IRN_PENDING: 'bg-amber-100 text-amber-700',
  IRN_REGISTERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  IRN_PENDING: 'IRN Pending',
  IRN_REGISTERED: 'IRN Registered',
  CANCELLED: 'Cancelled',
};

const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'NEFT', 'RTGS', 'CHEQUE', 'OTHER'];

function fmt(amount: number | string) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>{value}</span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [payNote, setPayNote] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/billing/invoices/${id}`).then((r: any) => r.data?.data ?? r.data),
  });

  const addPaymentMutation = useMutation({
    mutationFn: (payload: { amount: number; mode: string; note?: string }) =>
      api.post(`/billing/invoices/${id}/payments`, payload),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      setShowPaymentForm(false);
      setPayAmount('');
      setPayMode('CASH');
      setPayNote('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Payment failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/billing/invoices/${id}/cancel`),
    onSuccess: () => {
      toast.success('Invoice cancelled');
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      setShowCancelConfirm(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Cancel failed'),
  });

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    addPaymentMutation.mutate({ amount, mode: payMode, note: payNote || undefined });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground/60">Loading…</div>;
  if (!invoice) return <div className="p-6 text-red-500">Invoice not found</div>;

  const lineItems: any[] = invoice.lines ?? invoice.lineItems ?? invoice.items ?? [];
  const payments: any[] = invoice.payments ?? [];
  const gst = invoice.gstBreakdown ?? invoice.taxBreakdown ?? null;
  const isOwner = user?.role === Role.OWNER;
  const canCancel = isOwner && (invoice.status === 'DRAFT' || invoice.status === 'CONFIRMED');
  const balanceDue = Number(invoice.balanceDue ?? 0);
  const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/pos/invoices')}
            className="text-xs text-muted-foreground/60 hover:text-foreground/80 mb-2 flex items-center gap-1"
          >
            ← Invoices
          </button>
          <h1 className="text-2xl font-bold text-foreground">
            {invoice.invoiceNumber ?? `INV-${id?.slice(0, 8).toUpperCase()}`}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[invoice.status] ?? 'bg-muted text-muted-foreground'}`}>
              {STATUS_LABELS[invoice.status] ?? invoice.status}
            </span>
            <span className="text-sm text-muted-foreground/60">
              {invoice.invoiceDate
                ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
                : new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => downloadInvoicePdf(id!, (invoice as any).invoiceNumber)}
            className="border rounded-lg px-4 py-2 text-sm font-medium text-amber-700 border-amber-200 hover:bg-amber-50"
          >
            View PDF
          </button>
          {canCancel && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50"
            >
              Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-card rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold text-foreground/80">Customer</h2>
        <Row label="Name" value={invoice.customer?.name ?? invoice.customerName ?? '—'} bold />
        {(invoice.customer?.phone ?? invoice.customerPhone) && (
          <Row label="Phone" value={invoice.customer?.phone ?? invoice.customerPhone} />
        )}
        {(invoice.customer?.email ?? invoice.customerEmail) && (
          <Row label="Email" value={invoice.customer?.email ?? invoice.customerEmail} />
        )}
        {(invoice.customer?.gstin ?? invoice.customerGstin) && (
          <Row label="GSTIN" value={<span className="font-mono text-xs">{invoice.customer?.gstin ?? invoice.customerGstin}</span>} />
        )}
        {(invoice.customer?.address ?? invoice.customerAddress) && (
          <Row label="Address" value={invoice.customer?.address ?? invoice.customerAddress} />
        )}
      </div>

      {/* Line Items */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-foreground/80">Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="bg-muted/50 border-b">
              <tr>
                {['Item', 'Qty', 'Net Wt (g)', 'Rate/g', 'Making', 'Line Total'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lineItems.map((item: any, idx: number) => (
                <tr key={item.id ?? idx} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.name ?? item.itemName ?? item.item?.name}</div>
                    {item.sku && <div className="text-xs text-muted-foreground/60 font-mono">{item.sku}</div>}
                  </td>
                  <td className="px-4 py-3 text-foreground/80">{item.qty ?? item.quantity ?? 1}</td>
                  <td className="px-4 py-3 text-foreground/80">{Number(item.netWeightG ?? item.netWeight ?? 0).toFixed(3)}</td>
                  <td className="px-4 py-3 text-foreground/80">{fmt(item.ratePerGram ?? item.rate ?? 0)}</td>
                  <td className="px-4 py-3 text-foreground/80">
                    {item.makingCharge != null
                      ? fmt(item.makingCharge)
                      : item.makingPct != null
                      ? `${Number(item.makingPct).toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">{fmt(item.lineTotal ?? item.amount ?? 0)}</td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground/60">No items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GST Breakdown */}
        <div className="bg-card rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-foreground/80">GST Breakdown</h2>
          {gst ? (
            <>
              {gst.cgst != null && <Row label={`CGST (${gst.cgstRate ?? ''}%)`} value={fmt(gst.cgst)} />}
              {gst.sgst != null && <Row label={`SGST (${gst.sgstRate ?? ''}%)`} value={fmt(gst.sgst)} />}
              {gst.igst != null && <Row label={`IGST (${gst.igstRate ?? ''}%)`} value={fmt(gst.igst)} />}
              {gst.cess != null && gst.cess > 0 && <Row label="Cess" value={fmt(gst.cess)} />}
              <div className="border-t pt-2">
                <Row label="Total Tax" value={fmt(gst.totalTax ?? gst.total ?? 0)} bold />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/60">No GST data</p>
          )}
          <div className="border-t pt-3 space-y-2">
            <Row label="Subtotal" value={fmt(invoice.subTotal ?? invoice.subtotal ?? 0)} />
            <Row
              label="Grand Total"
              value={<span className="text-base font-bold text-amber-700">{fmt(invoice.totalAmount ?? invoice.grandTotal ?? 0)}</span>}
            />
          </div>
        </div>

        {/* Balance Summary */}
        <div className="bg-card rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-foreground/80">Payment Summary</h2>
          <Row label="Grand Total" value={fmt(invoice.totalAmount ?? invoice.grandTotal ?? 0)} />
          <Row label="Total Paid" value={<span className="text-green-700">{fmt(totalPaid)}</span>} bold />
          <div className="border-t pt-2">
            <Row
              label="Balance Due"
              value={
                <span className={balanceDue > 0 ? 'text-red-600 text-base font-bold' : 'text-green-700 text-base font-bold'}>
                  {fmt(balanceDue)}
                </span>
              }
            />
          </div>
          {invoice.status !== 'CANCELLED' && balanceDue > 0 && !showPaymentForm && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="mt-2 w-full bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-700"
            >
              + Add Payment
            </button>
          )}
        </div>
      </div>

      {/* Add Payment Form */}
      {showPaymentForm && (
        <div className="bg-card rounded-xl border p-5">
          <h2 className="font-semibold text-foreground/80 mb-4">Record Payment</h2>
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={balanceDue}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Max ${fmt(balanceDue)}`}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mode</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note (optional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Ref / UTR…"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={addPaymentMutation.isPending}
                className="bg-amber-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {addPaymentMutation.isPending ? 'Recording…' : 'Record Payment'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPaymentForm(false); setPayAmount(''); setPayNote(''); }}
                className="border rounded-lg px-5 py-2 text-sm font-medium hover:bg-muted/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-foreground/80">Payment History</h2>
          {invoice.status !== 'CANCELLED' && balanceDue > 0 && !showPaymentForm && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium underline"
            >
              + Add Payment
            </button>
          )}
        </div>
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Date', 'Mode', 'Amount', 'Note'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p: any, idx: number) => (
                  <tr key={p.id ?? idx} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(p.paidAt ?? p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-muted text-foreground/80 px-2 py-0.5 rounded text-xs font-medium">
                        {p.mode ?? p.paymentMode}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">{fmt(p.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground/60 text-xs">{p.note ?? p.reference ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground/60">No payments recorded</p>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">Cancel Invoice?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will cancel invoice{' '}
              <span className="font-mono font-semibold text-foreground">
                {invoice.invoiceNumber ?? id?.slice(0, 8).toUpperCase()}
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 border rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted/50"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
