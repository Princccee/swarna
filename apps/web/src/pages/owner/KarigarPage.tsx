import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function KarigarPage() {
  const [page, setPage] = useState(1);

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['karigar-balance'],
    queryFn: () => api.get('/orders/karigar/balance').then((r: any) => r.data),
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['karigar-ledger', page],
    queryFn: () =>
      api.get(`/orders/karigar/ledger?page=${page}&limit=20`).then((r: any) => r.data),
  });

  const balances: any[] = balanceData?.data ?? balanceData ?? [];
  const entries: any[] = ledgerData?.data?.entries ?? ledgerData?.entries ?? [];
  const meta = ledgerData?.data?.meta ?? ledgerData?.meta;

  function formatWeight(val: any) {
    const n = Number(val);
    return isNaN(n) ? '—' : n.toFixed(3);
  }

  function formatDate(val: any) {
    if (!val) return '—';
    return new Date(val).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="p-6 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Karigar Ledger</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Metal issued and returned across all karigar accounts
        </p>
      </div>

      {/* ── Section 1: Balance cards ── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Outstanding Balances
        </h2>

        {balanceLoading ? (
          <div className="py-8 text-center text-muted-foreground/60 text-sm">Loading balances…</div>
        ) : balances.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground/60 text-sm">No karigar records found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {balances.map((k: any) => {
              const balance = Number(k.balanceG ?? 0);
              const hasBalance = balance > 0;
              return (
                <div
                  key={k.karigarId ?? k.karigarName}
                  className="bg-card border rounded-xl p-5 shadow-sm flex flex-col gap-3"
                >
                  <p className="font-semibold text-foreground truncate">{k.karigarName ?? k.name}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground/60 mb-0.5">Issued</p>
                      <p className="text-sm font-medium tabular-nums text-foreground/80">
                        {formatWeight(k.issuedG)} g
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60 mb-0.5">Returned</p>
                      <p className="text-sm font-medium tabular-nums text-foreground/80">
                        {formatWeight(k.returnedG)} g
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60 mb-0.5">Balance</p>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          hasBalance ? 'text-amber-600' : 'text-muted-foreground'
                        }`}
                      >
                        {formatWeight(balance)} g
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: Full ledger table ── */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Transaction Ledger
        </h2>

        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            {ledgerLoading ? (
              <div className="py-10 text-center text-muted-foreground/60 text-sm">Loading ledger…</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {[
                      'Date',
                      'Karigar',
                      'Order #',
                      'Type',
                      'Weight (g)',
                      'Metal',
                      'Notes',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((row: any, idx: number) => {
                    const isIssued = row.type === 'ISSUED';
                    return (
                      <tr key={row.id ?? idx} className="hover:bg-muted/50">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatDate(row.date ?? row.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {row.karigarName ?? row.karigar?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {row.orderNumber ?? row.order?.orderNumber ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              isIssued
                                ? 'bg-red-50 text-red-600'
                                : 'bg-green-50 text-green-600'
                            }`}
                          >
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-foreground/80 whitespace-nowrap">
                          {formatWeight(row.weightG)} g
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {row.metal ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                          {row.notes ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {entries.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-muted-foreground/60"
                      >
                        No ledger entries found.
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
          <div className="flex items-center justify-between text-sm mt-3">
            <span className="text-muted-foreground">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of{' '}
              {meta.total}
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
      </section>
    </div>
  );
}
