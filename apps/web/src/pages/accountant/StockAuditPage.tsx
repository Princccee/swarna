import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: '24K', GOLD_22K: '22K', GOLD_18K: '18K', GOLD_14K: '14K',
  SILVER_999: 'Ag 999', SILVER_925: 'Ag 925', PLATINUM_950: 'Pt 950',
};

export default function StockAuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock-audit'],
    queryFn: () => api.get('/registers/stock-audit').then((r: any) => r.data),
  });

  const items: any[] = data?.items ?? [];
  const totalItems = items.length;
  const lowStockCount = items.filter((i: any) => i.stockQty <= 2).length;

  const fmtWeight = (n: number | string) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN') : '—';

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Stock Audit</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Full inventory snapshot — all items, current quantities</p>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Items</p>
            <p className="text-3xl font-bold text-foreground mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {totalItems}
            </p>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Low Stock</p>
            <p
              className={`text-3xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-600' : 'text-foreground'}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {lowStockCount}
            </p>
            {lowStockCount > 0 && (
              <p className="text-xs text-red-500 mt-0.5">qty &le; 2</p>
            )}
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In Stock</p>
            <p className="text-3xl font-bold text-green-700 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {totalItems - lowStockCount}
            </p>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Weight (g)</p>
            <p className="text-2xl font-bold text-foreground mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtWeight(items.reduce((acc: number, i: any) => acc + Number(i.netWeightG ?? 0), 0))}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground/60">Loading stock data…</div>
          ) : (
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-muted/50 border-b">
                <tr>
                  {['SKU', 'Name', 'Category', 'Purity', 'Net Weight (g)', 'Stock Qty', 'Last Movement'].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                        ['Net Weight (g)', 'Stock Qty'].includes(h) ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item: any) => {
                  const isLow = item.stockQty <= 2;
                  return (
                    <tr key={item.id} className={`hover:bg-muted/50 ${isLow ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category?.name ?? '—'}</td>
                      <td className="px-4 py-3">{PURITY_LABELS[item.purity] ?? item.purity}</td>
                      <td className="px-4 py-3 text-right">{fmtWeight(item.netWeightG)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-base ${isLow ? 'text-red-600' : 'text-foreground'}`}>
                          {item.stockQty}
                        </span>
                        {isLow && (
                          <span className="ml-1.5 text-xs text-red-500 font-medium">low</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(item.lastMovement)}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground/60">
                      No inventory data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
