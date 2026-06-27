import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const ENTITY_TYPES = [
  'INVOICE', 'INVENTORY_ITEM', 'CUSTOMER', 'PAYMENT',
  'ORDER', 'KARIGAR', 'CATEGORY', 'RATE', 'USER',
];

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-purple-100 text-purple-700',
  LOGOUT: 'bg-muted text-muted-foreground',
  VIEW: 'bg-muted text-muted-foreground',
};

function JsonCollapse({ value }: { value: any }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined) return <span className="text-muted-foreground/40 text-xs">—</span>;
  const preview = JSON.stringify(value).slice(0, 40);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-amber-600 hover:text-amber-700 font-mono underline underline-offset-2"
      >
        {open ? 'collapse' : preview + (preview.length >= 40 ? '…' : '')}
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-muted/50 border rounded p-2 overflow-x-auto max-w-xs leading-relaxed text-foreground/80">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AuditTrailPage() {
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-trail', entityType, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (entityType) params.set('entityType', entityType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/registers/audit?${params}`).then((r: any) => r.data);
    },
  });

  const entries: any[] = data?.entries ?? [];
  const meta = data?.meta;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Complete record of who changed what and when</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entity Type</label>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {(entityType || from || to) && (
          <button
            onClick={() => { setEntityType(''); setFrom(''); setTo(''); setPage(1); }}
            className="px-3 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted/50"
          >
            Clear
          </button>
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
                  {['Time', 'Actor', 'Action', 'Entity Type', 'Entity ID', 'Before', 'After'].map((h) => (
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
                {entries.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-muted/50 align-top">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(entry.createdAt).toLocaleDateString('en-IN')}{' '}
                      {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{entry.actorName ?? entry.actorId ?? 'System'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[entry.action] ?? 'bg-muted text-muted-foreground'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{entry.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground/60">{entry.entityId}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <JsonCollapse value={entry.before} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <JsonCollapse value={entry.after} />
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground/60">
                      No audit entries found
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
