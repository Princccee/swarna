import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HuidBadge } from '../../components/shared/HuidBadge';

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: '24K', GOLD_22K: '22K', GOLD_18K: '18K', GOLD_14K: '14K',
  SILVER_999: 'Ag 999', SILVER_925: 'Ag 925', PLATINUM_950: 'Pt 950',
};

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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <Link to="/owner/inventory/new" className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700">
          + Add Item
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white p-4 rounded-xl border">
        <input
          type="search" placeholder="Search name, SKU, HUID…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm w-64"
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

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['SKU', 'Name', 'Category', 'Purity', 'Net Wt (g)', 'Stock', 'HUID', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.category?.name}</td>
                  <td className="px-4 py-3">{PURITY_LABELS[item.purity] ?? item.purity}</td>
                  <td className="px-4 py-3">{Number(item.netWeightG).toFixed(3)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${item.stockQty <= 2 ? 'text-red-600' : 'text-gray-900'}`}>
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No items found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
