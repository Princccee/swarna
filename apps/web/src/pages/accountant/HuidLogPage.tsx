import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const ACTION_STYLES: Record<string, string> = {
  REGISTERED: 'bg-green-100 text-green-700',
  UPDATED: 'bg-blue-100 text-blue-700',
  SOLD: 'bg-muted text-muted-foreground',
  RETURNED: 'bg-amber-100 text-amber-700',
  MELTED: 'bg-red-100 text-red-700',
};

const BIS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
};

export default function HuidLogPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['huid-log', from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/registers/huid-log?${params}`).then((r: any) => r.data);
    },
  });

  const logs: any[] = data?.logs ?? [];
  const meta = data?.meta;

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">HUID Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">BIS hallmarking unique identifier activity trail</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From (optional)</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To (optional)</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {(from || to) && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted/50"
          >
            Clear
          </button>
        )}
        {!from && !to && (
          <p className="text-xs text-muted-foreground/60 pb-2">Showing all records — use date range to filter</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['Date & Time', 'Item Name', 'SKU', 'HUID', 'Action', 'BIS Response'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(log.date).toLocaleDateString('en-IN')}{' '}
                      <span className="text-xs">{new Date(log.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{log.itemName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{log.sku}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700 tracking-wider">{log.huid}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] ?? 'bg-muted text-muted-foreground'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BIS_STYLES[log.bisResponse] ?? 'bg-muted text-muted-foreground'}`}>
                        {log.bisResponse ?? 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground/60">
                      No HUID log entries found
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
            Page {page} of {meta.totalPages} — {meta.total} entries
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
