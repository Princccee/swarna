import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HuidBadge } from '../../components/shared/HuidBadge';
import { ImageLightbox } from '../../components/catalogue/ImageLightbox';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: 'Gold 24K',
  GOLD_22K: 'Gold 22K',
  GOLD_18K: 'Gold 18K',
  GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999',
  SILVER_925: 'Silver 925',
  PLATINUM_950: 'Platinum 950',
};

export default function CatalogueItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['catalogue-item', id],
    queryFn: () => api.get(`/catalogue/items/${id}`).then((r: any) => r.data),
    refetchInterval: 30_000,
  });

  const item = data?.item ?? data;

  useEffect(() => {
    setActiveImage(0);
  }, [id]);

  const reserveMutation = useMutation({
    mutationFn: () => {
      const token = localStorage.getItem('catalogue_token');
      return api.post(
        '/catalogue/reserve',
        { itemId: id },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    },
    onSuccess: () => setReserved(true),
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        localStorage.removeItem('catalogue_token');
        navigate('/catalogue/login?reason=session_expired');
      }
    },
  });

  const handleReserve = () => {
    const token = localStorage.getItem('catalogue_token');
    if (!token) {
      navigate('/catalogue/login');
      return;
    }
    reserveMutation.mutate();
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0a08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#c8860a', fontSize: '0.875rem' }}>Loading item…</p>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0a08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#f87171', fontWeight: 500 }}>Item not found.</p>
          <button
            onClick={() => navigate('/catalogue/browse')}
            style={{ marginTop: '16px', fontSize: '0.875rem', color: '#c8860a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Back to catalogue
          </button>
        </div>
      </div>
    );
  }

  const images: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  const price = item.indicativePrice ?? item.totalValue ?? null;

  return (
    <div style={{ minHeight: '100vh', background: '#0c0a08' }}>
      {/* Top nav */}
      <header style={{ background: '#181411', borderBottom: '1px solid #2e2720', position: 'sticky', top: 0, zIndex: 10 }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <Link to="/catalogue" style={{ color: '#c8860a', textDecoration: 'none', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
              onMouseLeave={e => (e.currentTarget.style.color = '#c8860a')}
            >Home</Link>
            <span style={{ color: '#3a3228' }}>›</span>
            {item?.category?.name && (
              <>
                <Link to={`/catalogue/browse?categoryId=${item.category.id}`}
                  style={{ color: '#c8860a', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#c8860a')}
                >
                  {item.category.name}
                </Link>
                <span style={{ color: '#3a3228' }}>›</span>
              </>
            )}
            <span style={{ color: '#a08060', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{item?.name ?? '…'}</span>
          </nav>
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            <LanguageToggle dark />
            <button
              onClick={() => navigate('/catalogue/my-orders')}
              style={{ fontSize: '0.875rem', color: '#c8860a', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e8a030')}
              onMouseLeave={e => (e.currentTarget.style.color = '#c8860a')}
            >
              My Orders
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Image gallery */}
          <div className="space-y-3">
            {/* Main image — click to open lightbox */}
            <div
              style={{
                aspectRatio: '1', borderRadius: '1rem', overflow: 'hidden',
                background: '#181411', border: '1px solid #2e2720',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', cursor: images.length > 0 ? 'zoom-in' : 'default',
              }}
              className="group"
              onClick={() => images.length > 0 && setLightboxOpen(true)}
            >
              {images.length > 0 ? (
                <>
                  <img
                    src={images[activeImage]}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Zoom hint overlay */}
                  <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span style={{
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      fontSize: '0.7rem', padding: '4px 10px', borderRadius: '99px',
                      backdropFilter: 'blur(4px)',
                    }}>
                      🔍 Click to zoom
                    </span>
                  </div>
                  {/* Prev/Next overlays */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveImage((i) => (i - 1 + images.length) % images.length); }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 text-amber-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        style={{ fontSize: '1rem', border: 'none', cursor: 'pointer' }}
                      >‹</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveImage((i) => (i + 1) % images.length); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 text-amber-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                        style={{ fontSize: '1rem', border: 'none', cursor: 'pointer' }}
                      >›</button>
                    </>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#5a4030', userSelect: 'none' }}>
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="8" y="16" width="56" height="44" rx="4" />
                    <circle cx="28" cy="32" r="5" />
                    <path d="M8 46l14-12 10 10 8-8 14 12" />
                  </svg>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>No image available</span>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    style={{
                      flexShrink: 0, width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden',
                      border: `2px solid ${i === activeImage ? '#c8860a' : '#2e2720'}`,
                      padding: 0, cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                  >
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Item info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Name & category */}
            <div>
              {item.category?.name && (
                <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', color: '#c8860a', textTransform: 'uppercase', marginBottom: '8px', margin: '0 0 8px' }}>
                  {item.category.name}
                </p>
              )}
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ede0c8', lineHeight: 1.3, margin: '0 0 4px' }}>{item.name}</h1>
              {item.sku && (
                <p style={{ fontSize: '0.75rem', color: '#5a4a38', fontFamily: 'monospace', margin: 0 }}>{item.sku}</p>
              )}
            </div>

            {/* Specs */}
            <div style={{ background: '#181411', borderRadius: '12px', border: '1px solid #2e2720', overflow: 'hidden' }}>
              <SpecRow label="Purity" value={PURITY_LABELS[item.purity] ?? item.purity ?? '—'} />
              <SpecRow
                label="Gross Weight"
                value={item.grossWeightG ? `${Number(item.grossWeightG).toFixed(3)} g` : '—'}
              />
              <SpecRow
                label="Net Weight"
                value={item.netWeightG ? `${Number(item.netWeightG).toFixed(3)} g` : '—'}
              />
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #2e2720' }}>
                <span style={{ fontSize: '0.875rem', color: '#7a6a55' }}>HUID</span>
                <HuidBadge huid={item.huid} />
              </div>
            </div>

            {/* Live price */}
            <div className="bg-amber-700 text-white rounded-xl px-5 py-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-amber-200 mb-1">
                    Indicative Price
                  </p>
                  {price != null ? (
                    <p className="text-3xl font-bold tabular-nums">
                      ₹{Number(price).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </p>
                  ) : (
                    <p className="text-lg text-amber-300">Price on request</p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              </div>

              {/* Breakdown toggle */}
              {price != null && (
                <button
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="mt-3 text-xs text-amber-200 underline underline-offset-2 hover:text-white transition-colors"
                >
                  {showBreakdown ? 'Hide breakdown' : 'See breakdown'}
                </button>
              )}

              {/* Breakdown rows */}
              {showBreakdown && price != null && (
                <div className="mt-3 pt-3 border-t border-amber-600 space-y-1.5 text-xs text-amber-100">
                  <BreakdownRow label={`Net weight`} value={`${Number(item.netWeightG).toFixed(3)} g`} />
                  {item.indicativePrice != null && item.netWeightG != null && (
                    <BreakdownRow
                      label="Metal value"
                      value={`₹${(Number(item.indicativePrice) - Number(item.stoneValue ?? 0) - (Number(item.makingPerGram ?? 0) * Number(item.netWeightG))).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    />
                  )}
                  {Number(item.stoneValue) > 0 && (
                    <BreakdownRow label="Stone value" value={`₹${Number(item.stoneValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                  )}
                  {Number(item.makingPerGram) > 0 && (
                    <BreakdownRow label="Making charges" value={`₹${(Number(item.makingPerGram) * Number(item.netWeightG)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                  )}
                  {Number(item.makingPct) > 0 && (
                    <BreakdownRow label="Making %" value={`${Number(item.makingPct).toFixed(1)}%`} />
                  )}
                  <div className="pt-1.5 border-t border-amber-600 flex justify-between font-semibold text-white">
                    <span>Total (indicative)</span>
                    <span>₹{Number(price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Reserve button */}
            {reserved ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#0d1f12', border: '1px solid #1a4a28', borderRadius: '12px', padding: '16px 20px' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10l4.5 4.5L16 6" />
                </svg>
                <div>
                  <p style={{ fontWeight: 600, color: '#4ade80', margin: '0 0 2px' }}>Reserved!</p>
                  <p style={{ fontSize: '0.75rem', color: '#3ab060', margin: 0 }}>
                    We'll hold this item for you. Our team will reach out shortly.
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleReserve}
                disabled={reserveMutation.isPending}
                style={{
                  width: '100%', background: '#c8860a', color: '#fff', border: 'none',
                  fontWeight: 600, padding: '14px 0', borderRadius: '12px',
                  fontSize: '0.875rem', letterSpacing: '0.05em', cursor: reserveMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: reserveMutation.isPending ? 0.6 : 1, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!reserveMutation.isPending) (e.currentTarget.style.background = '#a86e08'); }}
                onMouseLeave={e => (e.currentTarget.style.background = '#c8860a')}
              >
                {reserveMutation.isPending ? 'Reserving…' : 'Reserve This Item'}
              </button>
            )}

            {reserveMutation.isError && (
              <p style={{ fontSize: '0.875rem', color: '#f87171', textAlign: 'center', margin: 0 }}>
                {(reserveMutation.error as any)?.response?.data?.message ?? 'Something went wrong. Please try again.'}
              </p>
            )}

            <p style={{ fontSize: '0.75rem', color: '#4a3a2a', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
              Reservations hold the item for 48 hours. Price shown is indicative and may vary at billing.
            </p>
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {lightboxOpen && images.length > 0 && (
        <ImageLightbox
          images={images}
          initialIndex={activeImage}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2e2720' }}>
      <span style={{ fontSize: '0.875rem', color: '#7a6a55' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#ede0c8' }}>{value}</span>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
