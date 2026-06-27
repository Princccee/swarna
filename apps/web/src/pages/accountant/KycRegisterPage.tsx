import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function KycRegisterPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['kyc-register', page],
    queryFn: () =>
      api.get(`/registers/kyc?page=${page}`).then((r: any) => r.data),
  });

  const customers: any[] = data?.customers ?? [];
  const meta = data?.meta;

  const fmtAmount = (n: number | string) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">KYC Register</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Customer identity verification and spending summary</p>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
          ) : (
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Name', 'Phone', 'Email', 'PAN Number', 'KYC Status', 'Total Spent (₹)', 'Joined'].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                        h === 'Total Spent (₹)' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c: any) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground/80 tracking-wider">
                      {c.panNumber ?? <span className="text-muted-foreground/40 font-normal">Not provided</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.kycVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {fmtAmount(c.totalSpent ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground/60">
                      No customers found
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
            Page {page} of {meta.totalPages} — {meta.total} customers
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-muted/50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
