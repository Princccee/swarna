import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { HuidBadge } from '../../components/shared/HuidBadge';
import { StockMovementDrawer } from '../../components/shared/StockMovementDrawer';
import { toast } from 'sonner';

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: 'Gold 24K', GOLD_22K: 'Gold 22K', GOLD_18K: 'Gold 18K', GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999', SILVER_925: 'Silver 925', PLATINUM_950: 'Platinum 950',
};

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showStockDrawer, setShowStockDrawer] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get(`/inventory/items/${id}`).then((r) => r.data),
  });

  const { data: valuationData } = useQuery({
    queryKey: ['valuation', id],
    queryFn: () => api.get(`/inventory/items/${id}/valuation`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const { data: stockHistory } = useQuery({
    queryKey: ['stockHistory', id],
    queryFn: () => api.get(`/inventory/items/${id}/stock-history`).then((r) => r.data),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/inventory/items/${id}`),
    onSuccess: () => { toast.success('Item deleted'); navigate('/owner/inventory'); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Cannot delete'),
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading…</div>;
  if (!item) return <div className="p-6 text-red-500">Item not found</div>;

  const val = valuationData?.valuation;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          <p className="text-gray-500 font-mono text-sm mt-1">{item.sku}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowStockDrawer(true)} className="border rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50">
            Adjust Stock
          </button>
          <button onClick={() => deleteMutation.mutate()} className="border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Details Card */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">Item Details</h2>
          <Row label="Category" value={item.category?.name} />
          <Row label="Purity" value={PURITY_LABELS[item.purity] ?? item.purity} />
          <Row label="Gross Weight" value={`${Number(item.grossWeightG).toFixed(3)} g`} />
          <Row label="Net Weight" value={`${Number(item.netWeightG).toFixed(3)} g`} />
          {Number(item.stoneWeightG) > 0 && <Row label="Stone Weight" value={`${Number(item.stoneWeightG).toFixed(3)} g`} />}
          <Row label="Making %" value={`${Number(item.makingPct).toFixed(2)}%`} />
          <Row label="Stock Qty" value={
            <span className={Number(item.stockQty) <= 2 ? 'text-red-600 font-bold' : 'font-semibold'}>
              {item.stockQty}
            </span>
          } />
          <Row label="HUID" value={<HuidBadge huid={item.huid} />} />
        </div>

        {/* Valuation Card */}
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold text-gray-700">Live Valuation</h2>
          {val ? (
            <>
              <Row label="Rate/g" value={`₹${val.ratePerGram.toLocaleString('en-IN')}`} />
              <Row label="Metal Value" value={`₹${val.metalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
              <Row label="Making Charge" value={`₹${val.makingCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} />
              {val.stoneValue > 0 && <Row label="Stone Value" value={`₹${val.stoneValue.toLocaleString('en-IN')}`} />}
              <div className="border-t pt-2 mt-2">
                <Row label="Total Value" value={<span className="text-lg font-bold text-amber-700">₹{val.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>} />
              </div>
              <p className="text-xs text-gray-400">Rate as of {new Date(val.snappedAt).toLocaleTimeString()}</p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">{valuationData?.reason ?? 'Rate unavailable'}</p>
          )}
        </div>
      </div>

      {/* Stock History */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Stock History</h2>
        {stockHistory?.rows?.length ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Type', 'Qty', 'Reason', 'Date'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {stockHistory.rows.map((mv: any) => (
                <tr key={mv.id}>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      mv.type === 'IN' ? 'bg-green-100 text-green-700' :
                      mv.type === 'OUT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>{mv.type}</span>
                  </td>
                  <td className="px-3 py-2 font-mono">{mv.qty}</td>
                  <td className="px-3 py-2 text-gray-500">{mv.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{new Date(mv.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 text-sm">No movements yet</p>}
      </div>

      {showStockDrawer && (
        <StockMovementDrawer
          itemId={id!} itemName={item.name} currentQty={item.stockQty}
          onClose={() => setShowStockDrawer(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
