import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  READY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-600',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default function MyOrdersPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('catalogue_token');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalogue-my-orders'],
    queryFn: () =>
      api
        .get('/catalogue/my-orders', {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((r: any) => r.data),
    enabled: !!token,
  });

  const orders: any[] = data?.orders ?? data?.rows ?? data ?? [];

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Sign in to view your orders</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
            You need to be logged in to see your reservations and order history.
          </p>
          <Link
            to="/catalogue/login"
            className="inline-block bg-amber-700 hover:bg-amber-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            Sign In
          </Link>
          <p className="mt-4 text-sm text-gray-400">
            No account?{' '}
            <Link
              to="/catalogue/register"
              className="text-amber-700 underline underline-offset-2 hover:text-amber-900"
            >
              Register here
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Top nav */}
      <header className="bg-white/80 backdrop-blur border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/catalogue/browse')}
            className="flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13L5 8l5-5" />
            </svg>
            Browse
          </button>
          <span className="text-sm font-semibold text-primary">Svarna Jewels</span>
          <button
            onClick={() => {
              localStorage.removeItem('catalogue_token');
              navigate('/catalogue/login');
            }}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Orders</h1>

        {isLoading && (
          <div className="text-center py-16 text-amber-700 text-sm">Loading your orders…</div>
        )}

        {isError && (
          <div className="text-center py-16">
            <p className="text-red-500 font-medium mb-2">Could not load orders.</p>
            <p className="text-gray-400 text-sm">Please check your connection and try again.</p>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-gray-600 font-medium">No orders yet</p>
            <p className="text-gray-400 text-sm mt-2 mb-6">
              Browse our collection and reserve an item to get started.
            </p>
            <Link
              to="/catalogue/browse"
              className="inline-block bg-amber-700 hover:bg-amber-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              Browse Catalogue
            </Link>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 border-b border-amber-100">
                    <tr>
                      {['Order #', 'Type', 'Status', 'Expected Ready', 'Est. Value', 'Balance Due'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-semibold text-amber-800 uppercase tracking-wider whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-50">
                    {orders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-gray-700 whitespace-nowrap">
                          #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 capitalize whitespace-nowrap">
                          {order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge status={order.status ?? 'PENDING'} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap tabular-nums">
                          {order.expectedReadyDate
                            ? new Date(order.expectedReadyDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-gray-700 font-medium tabular-nums whitespace-nowrap">
                          {order.estimatedValue != null
                            ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">
                          {order.balanceDue != null ? (
                            <span
                              className={
                                Number(order.balanceDue) > 0
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-green-700 font-medium'
                              }
                            >
                              {Number(order.balanceDue) > 0
                                ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                                : 'Paid'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {orders.map((order: any) => (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-amber-100 shadow-sm p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-gray-700 font-semibold">
                      #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                    </span>
                    <StatusBadge status={order.status ?? 'PENDING'} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Type</p>
                      <p className="text-gray-700 capitalize">
                        {order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                        Expected Ready
                      </p>
                      <p className="text-gray-700">
                        {order.expectedReadyDate
                          ? new Date(order.expectedReadyDate).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                        Est. Value
                      </p>
                      <p className="text-gray-700 font-medium tabular-nums">
                        {order.estimatedValue != null
                          ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">
                        Balance Due
                      </p>
                      <p className="tabular-nums">
                        {order.balanceDue != null ? (
                          <span
                            className={
                              Number(order.balanceDue) > 0
                                ? 'text-amber-700 font-semibold'
                                : 'text-green-700 font-medium'
                            }
                          >
                            {Number(order.balanceDue) > 0
                              ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                              : 'Paid'}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
