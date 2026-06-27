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
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
        <p className="text-amber-700 text-sm">Loading item…</p>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-medium">Item not found.</p>
          <button
            onClick={() => navigate('/catalogue/browse')}
            className="mt-4 text-sm text-amber-700 underline underline-offset-2"
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Top nav */}
      <header className="bg-card/80 backdrop-blur border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <Link to="/catalogue" className="text-amber-600 hover:text-amber-800 shrink-0">Home</Link>
            <span className="text-muted-foreground/40">›</span>
            {item?.category?.name && (
              <>
                <Link to={`/catalogue/browse?categoryId=${item.category.id}`} className="text-amber-600 hover:text-amber-800 truncate max-w-[100px]">
                  {item.category.name}
                </Link>
                <span className="text-muted-foreground/40">›</span>
              </>
            )}
            <span className="text-foreground/70 truncate max-w-[120px] sm:max-w-none">{item?.name ?? '…'}</span>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <LanguageToggle />
            <button
              onClick={() => navigate('/catalogue/my-orders')}
              className="text-sm text-amber-700 hover:text-amber-900 transition-colors"
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
              className="aspect-square rounded-2xl overflow-hidden bg-card border border-amber-100 shadow-sm flex items-center justify-center relative group"
              style={{ cursor: images.length > 0 ? 'zoom-in' : 'default' }}
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
                <div className="flex flex-col items-center gap-3 text-amber-300 select-none">
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="8" y="16" width="56" height="44" rx="4" />
                    <circle cx="28" cy="32" r="5" />
                    <path d="M8 46l14-12 10 10 8-8 14 12" />
                  </svg>
                  <span className="text-sm font-medium">No image available</span>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === activeImage ? 'border-amber-500' : 'border-transparent hover:border-amber-200'
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Item info */}
          <div className="space-y-6">
            {/* Name & category */}
            <div>
              {item.category?.name && (
                <p className="text-xs font-semibold tracking-widest text-amber-600 uppercase mb-2">
                  {item.category.name}
                </p>
              )}
              <h1 className="text-2xl font-bold text-foreground leading-snug">{item.name}</h1>
              {item.sku && (
                <p className="text-xs text-muted-foreground/60 font-mono mt-1">{item.sku}</p>
              )}
            </div>

            {/* Specs */}
            <div className="bg-card rounded-xl border border-amber-100 divide-y divide-amber-50">
              <SpecRow label="Purity" value={PURITY_LABELS[item.purity] ?? item.purity ?? '—'} />
              <SpecRow
                label="Gross Weight"
                value={item.grossWeightG ? `${Number(item.grossWeightG).toFixed(3)} g` : '—'}
              />
              <SpecRow
                label="Net Weight"
                value={item.netWeightG ? `${Number(item.netWeightG).toFixed(3)} g` : '—'}
              />
              <div className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">HUID</span>
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
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 10l4.5 4.5L16 6" />
                </svg>
                <div>
                  <p className="font-semibold text-green-800">Reserved!</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    We'll hold this item for you. Our team will reach out shortly.
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleReserve}
                disabled={reserveMutation.isPending}
                className="w-full bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm tracking-wide"
              >
                {reserveMutation.isPending ? 'Reserving…' : 'Reserve This Item'}
              </button>
            )}

            {reserveMutation.isError && (
              <p className="text-sm text-red-500 text-center">
                {(reserveMutation.error as any)?.response?.data?.message ?? 'Something went wrong. Please try again.'}
              </p>
            )}

            <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
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
    <div className="px-4 py-3 flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
