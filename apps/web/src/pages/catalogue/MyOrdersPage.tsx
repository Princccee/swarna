import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

const STATUS_DARK: Record<string, { bg: string; color: string }> = {
  DRAFT:     { bg: '#1a1714', color: '#7a6a55' },
  CONFIRMED: { bg: '#0a1f3a', color: '#60a5fa' },
  MAKING:    { bg: '#1a0f2e', color: '#c084fc' },
  READY:     { bg: '#0a2218', color: '#4ade80' },
  INVOICED:  { bg: '#2a1f08', color: '#f0b429' },
  CANCELLED: { bg: '#2a0f0f', color: '#f87171' },
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const style = STATUS_DARK[status] ?? { bg: '#201c17', color: '#7a6a55' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '99px',
      fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em',
      background: style.bg, color: style.color, textTransform: 'capitalize',
    }}>
      {label.toLowerCase()}
    </span>
  );
}

export default function MyOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = localStorage.getItem('catalogue_token');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['catalogue-my-orders', token],
    queryFn: () =>
      api.get('/catalogue/my-orders', { headers: { Authorization: `Bearer ${token}` } }).then((r: any) => r.data),
    enabled: !!token,
  });

  useEffect(() => {
    if (isError && (error as any)?.response?.status === 401) {
      localStorage.removeItem('catalogue_token');
      navigate('/catalogue/login?reason=session_expired');
    }
  }, [isError, error, navigate]);

  const orders: any[] = Array.isArray(data) ? data : (data?.orders ?? data?.rows ?? []);

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0a08', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <LanguageToggle dark />
          </div>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ede0c8', marginBottom: '8px' }}>
            {t('catalogue.orders.signin_title')}
          </h2>
          <p style={{ color: '#7a6a55', fontSize: '0.875rem', marginBottom: '24px', maxWidth: '280px', lineHeight: 1.6 }}>
            {t('catalogue.orders.signin_desc')}
          </p>
          <Link to="/catalogue/login" style={{
            display: 'inline-block', background: '#c8860a', color: '#fff',
            fontWeight: 600, padding: '10px 24px', borderRadius: '8px',
            fontSize: '0.875rem', textDecoration: 'none',
          }}>
            {t('common.signIn')}
          </Link>
          <p style={{ marginTop: '16px', fontSize: '0.875rem', color: '#5a4a38' }}>
            {t('catalogue.orders.no_account')}{' '}
            <Link to="/catalogue/register" style={{ color: '#c8860a', textDecoration: 'underline' }}>
              {t('catalogue.orders.register')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0c0a08' }}>
      {/* Header */}
      <header style={{ background: '#181411', borderBottom: '1px solid #2e2720', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="max-w-4xl mx-auto px-4 py-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => navigate('/catalogue/browse')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: '#c8860a', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
            onMouseLeave={e => (e.currentTarget.style.color = '#c8860a')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13L5 8l5-5" />
            </svg>
            {t('common.browse')}
          </button>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c8860a' }}>{t('common.brand')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LanguageToggle dark />
            <button
              onClick={() => { localStorage.removeItem('catalogue_token'); navigate('/catalogue/login'); }}
              style={{ fontSize: '0.875rem', color: '#7a6a55', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ede0c8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#7a6a55')}
            >
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ede0c8', marginBottom: '24px' }}>
          {t('catalogue.orders.title')}
        </h1>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: '#c8860a', fontSize: '0.875rem' }}>
            {t('catalogue.orders.loading')}
          </div>
        )}

        {isError && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ color: '#f87171', fontWeight: 500, marginBottom: '8px' }}>{t('catalogue.orders.load_error')}</p>
            <p style={{ color: '#5a4a38', fontSize: '0.875rem' }}>{t('catalogue.orders.load_error_hint')}</p>
          </div>
        )}

        {!isLoading && !isError && orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📋</div>
            <p style={{ color: '#ede0c8', fontWeight: 500, marginBottom: '8px' }}>{t('catalogue.orders.empty')}</p>
            <p style={{ color: '#7a6a55', fontSize: '0.875rem', marginBottom: '24px' }}>{t('catalogue.orders.empty_hint')}</p>
            <Link to="/catalogue/browse" style={{
              display: 'inline-block', background: '#c8860a', color: '#fff',
              fontWeight: 600, padding: '10px 24px', borderRadius: '8px',
              fontSize: '0.875rem', textDecoration: 'none',
            }}>
              {t('catalogue.orders.browse_catalogue')}
            </Link>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div style={{ background: '#181411', borderRadius: '16px', border: '1px solid #2e2720', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#201c17', borderBottom: '1px solid #2e2720' }}>
                        {[
                          t('catalogue.orders.col_order'),
                          t('catalogue.orders.col_type'),
                          t('catalogue.orders.col_status'),
                          t('catalogue.orders.col_ready'),
                          t('catalogue.orders.col_value'),
                          t('catalogue.orders.col_balance'),
                        ].map((h) => (
                          <th key={h} style={{
                            padding: '12px 16px', textAlign: 'left',
                            fontSize: '0.7rem', fontWeight: 600, color: '#c8860a',
                            textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order: any, i: number) => (
                        <tr key={order.id}
                          style={{ borderBottom: i < orders.length - 1 ? '1px solid #2e2720' : 'none' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#1e1a14')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#ede0c8', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                          </td>
                          <td style={{ padding: '14px 16px', color: '#7a6a55', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                            {order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                          </td>
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            <StatusBadge status={order.status ?? 'PENDING'} />
                          </td>
                          <td style={{ padding: '14px 16px', color: '#7a6a55', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {order.expectedReady
                              ? new Date(order.expectedReady).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </td>
                          <td style={{ padding: '14px 16px', color: '#ede0c8', fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {order.estimatedValue != null ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {order.balanceDue != null ? (
                              <span style={{ color: Number(order.balanceDue) > 0 ? '#e8a030' : '#4ade80', fontWeight: 600 }}>
                                {Number(order.balanceDue) > 0
                                  ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                                  : t('catalogue.orders.paid')}
                              </span>
                            ) : (
                              <span style={{ color: '#4a3a2a' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {orders.map((order: any) => (
                <div key={order.id} style={{ background: '#181411', borderRadius: '12px', border: '1px solid #2e2720', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#ede0c8', fontWeight: 700 }}>
                      #{order.orderNumber ?? order.id?.slice(0, 8).toUpperCase()}
                    </span>
                    <StatusBadge status={order.status ?? 'PENDING'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.875rem' }}>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#5a4a38', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        {t('catalogue.orders.col_type')}
                      </p>
                      <p style={{ color: '#ede0c8', textTransform: 'capitalize' }}>
                        {order.type?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#5a4a38', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        {t('catalogue.orders.col_ready')}
                      </p>
                      <p style={{ color: '#ede0c8' }}>
                        {order.expectedReady
                          ? new Date(order.expectedReady).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#5a4a38', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        {t('catalogue.orders.col_value')}
                      </p>
                      <p style={{ color: '#ede0c8', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {order.estimatedValue != null ? `₹${Number(order.estimatedValue).toLocaleString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.68rem', color: '#5a4a38', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        {t('catalogue.orders.col_balance')}
                      </p>
                      <p style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {order.balanceDue != null ? (
                          <span style={{ color: Number(order.balanceDue) > 0 ? '#e8a030' : '#4ade80', fontWeight: 600 }}>
                            {Number(order.balanceDue) > 0
                              ? `₹${Number(order.balanceDue).toLocaleString('en-IN')}`
                              : t('catalogue.orders.paid')}
                          </span>
                        ) : (
                          <span style={{ color: '#4a3a2a' }}>—</span>
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
