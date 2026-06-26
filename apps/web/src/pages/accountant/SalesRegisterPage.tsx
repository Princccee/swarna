import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

function today() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  UNPAID: 'bg-red-100 text-red-700',
};

export default function SalesRegisterPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-register', from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ from, to, page: String(page), limit: '50' });
      return api.get(`/registers/sales?${params}`).then((r: any) => r.data);
    },
  });

  const invoices: any[] = data?.invoices ?? [];
  const meta = data?.meta;
  const totals = data?.totals;

  const fmt = (n: number | string) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoice-level sales summary with GST and payment status</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-white rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => { setFrom(today()); setTo(today()); setPage(1); }}
          className="px-3 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50"
        >
          Today
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : (
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Invoice #', 'Customer', 'Date', 'Subtotal', 'GST', 'Total', 'Paid', 'Balance', 'Status'].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                        ['Subtotal', 'GST', 'Total', 'Paid', 'Balance'].includes(h) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-amber-700 font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.customerName}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">{fmt(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-right">{fmt(inv.gst)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(inv.total)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{fmt(inv.paid)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmt(inv.balance)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      No invoices found for this date range
                    </td>
                  </tr>
                )}
              </tbody>
              {totals && invoices.length > 0 && (
                <tfoot className="bg-amber-50 border-t-2 border-amber-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Totals — {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(totals.subtotal)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(totals.gst)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(totals.total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(totals.paid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(totals.balance)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {meta.totalPages} — {meta.total} invoices
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
