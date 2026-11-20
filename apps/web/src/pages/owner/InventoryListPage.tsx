import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HuidBadge } from '../../components/shared/HuidBadge';
import { PURITY_SHORT } from '../../lib/purities';

const PURITY_LABELS = PURITY_SHORT;

export default function InventoryListPage() {
  const [search, setSearch] = useState('');
  const [purity, setPurity] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['items', search, purity, lowStock, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (purity) params.set('purity', purity);
      if (lowStock) params.set('lowStock', 'true');
      return api.get(`/inventory/items?${params}`).then((r: any) => r.data);
    },
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <Link to="/owner/inventory/new" className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700">
          + Add Item
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-card p-4 rounded-xl border">
        <input
          type="search" placeholder="Search name, SKU, HUID…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm w-full sm:w-64"
        />
        <select
          value={purity} onChange={(e) => { setPurity(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Purities</option>
          {Object.entries(PURITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setPage(1); }} />
          Low stock only
        </label>
      </div>

      {/* Phone: one card per item */}
      <div className="md:hidden space-y-2">
        {isLoading && <div className="p-6 text-center text-muted-foreground/60">Loading…</div>}
        {!isLoading && items.length === 0 && (
          <div className="p-6 text-center text-muted-foreground/60 bg-card border rounded-xl">No items found</div>
        )}
        {!isLoading && items.map((item: any) => (
          <Link
            key={item.id}
            to={`/owner/inventory/${item.id}`}
            className="flex items-center gap-3 bg-card border rounded-xl p-3 active:bg-muted/50"
          >
            {item.imageUrls?.[0] ? (
              <img src={item.imageUrls[0]} alt={item.name} className="w-14 h-14 rounded-lg object-cover border shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-muted/50 border flex items-center justify-center text-[10px] text-muted-foreground/50 shrink-0">
                No img
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.category?.name} · {PURITY_LABELS[item.purity] ?? item.purity} · {Number(item.netWeightG).toFixed(3)} g
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[11px] text-muted-foreground">{item.sku}</span>
                <HuidBadge huid={item.huid} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-lg font-semibold tabular-nums leading-none ${item.stockQty <= 2 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {item.stockQty}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">in stock</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Table (tablet and desktop) */}
      <div className="hidden md:block bg-card rounded-xl border overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {['Image', 'SKU', 'Name', 'Category', 'Purity', 'Net Wt (g)', 'Stock', 'HUID', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    {item.imageUrls?.[0] ? (
                      <img src={item.imageUrls[0]} alt={item.name} className="w-10 h-10 rounded object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted/50 border flex items-center justify-center text-[9px] text-muted-foreground/50">
                        No img
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category?.name}</td>
                  <td className="px-4 py-3">{PURITY_LABELS[item.purity] ?? item.purity}</td>
                  <td className="px-4 py-3">{Number(item.netWeightG).toFixed(3)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${item.stockQty <= 2 ? 'text-red-600' : 'text-foreground'}`}>
                      {item.stockQty}
                    </span>
                  </td>
                  <td className="px-4 py-3"><HuidBadge huid={item.huid} /></td>
                  <td className="px-4 py-3">
                    <Link to={`/owner/inventory/${item.id}`} className="text-amber-600 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground/60">No items found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
