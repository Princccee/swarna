import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { downloadInvoicePdf, shareInvoicePdf } from '../../lib/download-pdf';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IRN_PENDING', label: 'IRN Pending' },
  { value: 'IRN_REGISTERED', label: 'IRN Registered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

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

function fmt(amount: number) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function InvoiceListPage() {
  const navigate = useNavigate();
  // Owner → /owner/invoices/:id (owner sidebar), staff → /pos/invoices/:id
  const invoiceBase = useLocation().pathname.startsWith('/owner') ? '/owner/invoices' : '/pos/invoices';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', search, status, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('invoiceNumber', search);
      if (status) params.set('status', status);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get(`/billing/invoices?${params}`).then((r: any) => r.data);
    },
  });

  const invoices: any[] = data?.data ?? data?.invoices ?? [];
  const meta = data?.meta;

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  const openPdf = (e: React.MouseEvent, invoiceId: string, invoiceNumber?: string) => {
    e.stopPropagation();
    downloadInvoicePdf(invoiceId, invoiceNumber);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-xl border">
        <input
          type="search"
          placeholder="Invoice number…"
          value={search}
          onChange={handleFilterChange(setSearch)}
          className="border rounded-lg px-3 py-2 text-sm w-48"
        />
        <select
          value={status}
          onChange={handleFilterChange(setStatus)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={handleFilterChange(setDateFrom)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={handleFilterChange(setDateTo)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {(search || status || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-muted-foreground/60 hover:text-foreground/80 px-2 py-2 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Phone: one card per invoice */}
      <div className="md:hidden space-y-2">
        {isLoading && <div className="p-6 text-center text-muted-foreground/60">Loading…</div>}
        {!isLoading && invoices.length === 0 && (
          <div className="p-6 text-center text-muted-foreground/60 bg-card border rounded-xl">No invoices found</div>
        )}
        {!isLoading && invoices.map((inv: any) => {
          const due = Number(inv.balanceDue ?? 0);
          const date = new Date(inv.invoiceDate ?? inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          return (
            <div
              key={inv.id}
              onClick={() => navigate(`${invoiceBase}/${inv.id}`)}
              className="bg-card border rounded-xl p-3.5 active:bg-muted/50 cursor-pointer"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {inv.invoiceNumber ?? inv.id?.slice(0, 8).toUpperCase()}
                  </p>
                  <p className="font-medium text-foreground truncate mt-0.5">{inv.customer?.name ?? inv.customerName ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-foreground">{fmt(inv.totalAmount ?? inv.grandTotal ?? 0)}</p>
                  {inv.billType === 'ESTIMATE' ? (
                    <span className="inline-flex mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">Estimate</span>
                  ) : (
                    <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t text-xs">
                <span className={due > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground'}>
                  {due > 0 ? `Due ${fmt(due)}` : inv.billType === 'ESTIMATE' && Number(inv.amountPaid ?? 0) === 0 ? 'Quotation' : 'Paid'}
                </span>
                <span className="flex items-center gap-4">
                  <button onClick={(e) => openPdf(e, inv.id, inv.invoiceNumber)} className="font-medium text-amber-700 dark:text-amber-400 py-1">
                    PDF
                  </button>
                  {inv.status !== 'CANCELLED' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        shareInvoicePdf(inv.id, {
                          invoiceNumber: inv.invoiceNumber,
                          billType: inv.billType,
                          amount: inv.totalAmount ?? inv.grandTotal,
                          customerPhone: inv.customer?.phone ?? inv.customerPhone,
                        });
                      }}
                      className="font-medium text-emerald-700 dark:text-emerald-400 py-1"
                    >
                      Share
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table (tablet and desktop) */}
      <div className="hidden md:block bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
          ) : (
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Invoice #', 'Customer', 'Date', 'Total', 'Status', 'Balance Due', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv: any) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`${invoiceBase}/${inv.id}`)}
                    className="hover:bg-muted/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-amber-700 font-semibold">
                      {inv.invoiceNumber ?? inv.id?.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {inv.customer?.name ?? inv.customerName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {inv.invoiceDate
                        ? new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : new Date(inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {fmt(inv.totalAmount ?? inv.grandTotal ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {inv.billType === 'ESTIMATE' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          Estimate
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={Number(inv.balanceDue ?? 0) > 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                        {fmt(inv.balanceDue ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => openPdf(e, inv.id, inv.invoiceNumber)}
                        className="text-xs text-amber-700 hover:text-amber-900 hover:underline font-medium"
                      >
                        PDF
                      </button>
                      {inv.status !== 'CANCELLED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            shareInvoicePdf(inv.id, {
                              invoiceNumber: inv.invoiceNumber,
                              billType: inv.billType,
                              amount: inv.totalAmount ?? inv.grandTotal,
                              customerPhone: inv.customer?.phone ?? inv.customerPhone,
                            });
                          }}
                          className="ml-3 text-xs text-emerald-700 hover:text-emerald-900 hover:underline font-medium"
                        >
                          Share
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground/60">
                      No invoices found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-muted/50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-muted/50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
