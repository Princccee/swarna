import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  READY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-red-100 text-red-600',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const cls = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export default function MyOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem('catalogue_token');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalogue-my-orders'],
    queryFn: () =>
      api.get('/catalogue/my-orders', { headers: { Authorization: `Bearer ${token}` } }).then((r: any) => r.data),
    enabled: !!token,
  });

  const orders: any[] = data?.orders ?? data?.rows ?? data ?? [];

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="flex justify-end mb-4"><LanguageToggle /></div>
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-foreground mb-2">{t('catalogue.orders.signin_title')}</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">{t('catalogue.orders.signin_desc')}</p>
          <Link to="/catalogue/login" className="inline-block bg-amber-700 hover:bg-amber-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
            {t('common.signIn')}
          </Link>
          <p className="mt-4 text-sm text-muted-foreground/60">
            {t('catalogue.orders.no_account')}{' '}
            <Link to="/catalogue/register" className="text-amber-700 underline underline-offset-2 hover:text-amber-900">
              {t('catalogue.orders.register')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Top nav */}
      <header className="bg-card/80 backdrop-blur border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/catalogue/browse')}
            className="flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13L5 8l5-5" />
            </svg>
            {t('common.browse')}
          </button>
          <span className="text-sm font-semibold text-primary">{t('common.brand')}</span>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <button
              onClick={() => { localStorage.removeItem('catalogue_token'); navigate('/catalogue/login'); }}
              className="text-sm text-muted-foreground hover:text-foreground/80 transition-colors"
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('catalogue.orders.title')}</h1>

        {isLoading && (
          <div className="text-center py-16 text-amber-700 text-sm">{t('catalogue.orders.loading')}</div>
        )}

        {isError && (
          <div className="text-center py-16">
            <p className="text-red-500 font-medium mb-2">{t('catalogue.orders.load_error')}</p>
            <p className="text-muted-foreground/60 text-sm">{t('catalogue.orders.load_error_hint')}</p>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-muted-foreground font-medium">{t('catalogue.orders.empty')}</p>
            <p className="text-muted-foreground/60 text-sm mt-2 mb-6">{t('catalogue.orders.empty_hint')}</p>
            <Link to="/catalogue/browse" className="inline-block bg-amber-700 hover:bg-amber-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors">
              {t('catalogue.orders.browse_catalogue')}
            </Link>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 border-b border-amber-100">
                    <tr>
                      {[
                        t('catalogue.orders.col_order'),
                        t('catalogue.orders.col_type'),
                        t('catalogue.orders.col_status'),
                        t('catalogue.orders.col_ready'),
                        t('catalogue.orders.col_value'),
                        t('catalogue.orders.col_balance'),
                      ].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-amber-800 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-50">
                    {orders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-foreground/80 whitespace-nowrap">
                          #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground capitalize whitespace-nowrap">
                          {order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <StatusBadge status={order.status ?? 'PENDING'} />
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap tabular-nums">
                          {order.expectedReadyDate
                            ? new Date(order.expectedReadyDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-foreground/80 font-medium tabular-nums whitespace-nowrap">
                          {order.estimatedValue != null ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums whitespace-nowrap">
                          {order.balanceDue != null ? (
                            <span className={Number(order.balanceDue) > 0 ? 'text-amber-700 font-semibold' : 'text-green-700 font-medium'}>
                              {Number(order.balanceDue) > 0
                                ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                                : t('catalogue.orders.paid')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
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
                <div key={order.id} className="bg-card rounded-xl border border-amber-100 shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-foreground/80 font-semibold">
                      #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                    </span>
                    <StatusBadge status={order.status ?? 'PENDING'} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-0.5">{t('catalogue.orders.col_type')}</p>
                      <p className="text-foreground/80 capitalize">{order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-0.5">{t('catalogue.orders.col_ready')}</p>
                      <p className="text-foreground/80">
                        {order.expectedReadyDate
                          ? new Date(order.expectedReadyDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-0.5">{t('catalogue.orders.col_value')}</p>
                      <p className="text-foreground/80 font-medium tabular-nums">
                        {order.estimatedValue != null ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/60 uppercase tracking-wide mb-0.5">{t('catalogue.orders.col_balance')}</p>
                      <p className="tabular-nums">
                        {order.balanceDue != null ? (
                          <span className={Number(order.balanceDue) > 0 ? 'text-amber-700 font-semibold' : 'text-green-700 font-medium'}>
                            {Number(order.balanceDue) > 0
                              ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                              : t('catalogue.orders.paid')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
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
