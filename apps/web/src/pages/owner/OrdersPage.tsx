import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'MAKING' | 'READY' | 'INVOICED' | 'CANCELLED';
type OrderType   = 'PRE_ORDER' | 'CUSTOM' | 'REPAIR';

// ── Badge helpers ──────────────────────────────────────────────────────────────

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-blue-100 text-blue-700' },
  MAKING:    { label: 'Making',    cls: 'bg-yellow-100 text-yellow-700' },
  READY:     { label: 'Ready',     cls: 'bg-green-100 text-green-700' },
  INVOICED:  { label: 'Invoiced',  cls: 'bg-purple-100 text-purple-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-600' },
};

const TYPE_META: Record<OrderType, { label: string; cls: string }> = {
  PRE_ORDER: { label: 'Pre-order', cls: 'bg-amber-100 text-amber-700' },
  CUSTOM:    { label: 'Custom',    cls: 'bg-teal-100 text-teal-700' },
  REPAIR:    { label: 'Repair',    cls: 'bg-orange-100 text-orange-700' },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function TypeBadge({ type }: { type: OrderType }) {
  const m = TYPE_META[type] ?? { label: type, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

// ── Currency formatter ─────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

// ── Component ──────────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: '',          label: 'All' },
  { value: 'DRAFT',     label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'MAKING',    label: 'Making' },
  { value: 'READY',     label: 'Ready' },
  { value: 'INVOICED',  label: 'Invoiced' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '',          label: 'All Types' },
  { value: 'PRE_ORDER', label: 'Pre-order' },
  { value: 'CUSTOM',    label: 'Custom' },
  { value: 'REPAIR',    label: 'Repair' },
];

export default function OrdersPage() {
  const navigate = useNavigate();

  const [status, setStatus]   = useState('');
  const [type, setType]       = useState('');
  const [dueSoon, setDueSoon] = useState(false);
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', status, type, dueSoon, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status)  params.set('status', status);
      if (type)    params.set('type', type);
      if (dueSoon) params.set('dueSoon', 'true');
      return api.get(`/orders?${params}`).then((r: any) => r.data);
    },
  });

  const orders: any[] = data?.orders ?? [];
  const meta = data?.meta;

  const handleRowClick = (id: string) => navigate(`/owner/orders/${id}`);

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button
          onClick={() => navigate('/owner/orders/new')}
          className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Order
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatus(tab.value); setPage(1); }}
            className={[
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              status === tab.value
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setType(f.value); setPage(1); }}
              className={[
                'px-3 py-1 text-xs font-medium rounded transition-colors',
                type === f.value
                  ? 'bg-amber-600 text-white'
                  : 'text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <span
            role="checkbox"
            aria-checked={dueSoon}
            tabIndex={0}
            onClick={() => { setDueSoon((d) => !d); setPage(1); }}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setDueSoon((d) => !d); setPage(1); } }}
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
              dueSoon ? 'bg-amber-600' : 'bg-gray-200',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform',
                dueSoon ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </span>
          <span className="text-gray-600">Due within 3 days</span>
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400 text-sm">Loading orders…</div>
          ) : (
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    'Order #',
                    'Type',
                    'Customer',
                    'Status',
                    'Expected Ready',
                    'Est. Value',
                    'Balance Due',
                    '',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order: any) => (
                  <tr
                    key={order.id}
                    onClick={() => handleRowClick(order.id)}
                    className="hover:bg-amber-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <TypeBadge type={order.type as OrderType} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 leading-snug">
                        {order.customer?.name ?? '—'}
                      </div>
                      {order.customer?.phone && (
                        <div className="text-xs text-gray-400">{order.customer.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={order.status as OrderStatus} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {order.expectedReadyDate
                        ? new Date(order.expectedReadyDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                      {order.estimatedValue != null ? fmt.format(order.estimatedValue) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={
                          order.balanceDue > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'
                        }
                      >
                        {order.balanceDue != null ? fmt.format(order.balanceDue) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRowClick(order.id); }}
                        className="text-amber-600 hover:text-amber-800 text-xs font-medium hover:underline focus:outline-none focus-visible:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                      No orders found
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
          <span className="text-gray-500">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
              className="px-3 py-1 border rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
