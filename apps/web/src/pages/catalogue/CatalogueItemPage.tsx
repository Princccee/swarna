import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HuidBadge } from '../../components/shared/HuidBadge';

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
  const [reserved, setReserved] = useState(false);

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

  const images: string[] = Array.isArray(item.images) ? item.images : [];
  const price = item.indicativePrice ?? item.totalValue ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Top nav */}
      <header className="bg-white/80 backdrop-blur border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
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
            onClick={() => navigate('/catalogue/my-orders')}
            className="text-sm text-amber-700 hover:text-amber-900 transition-colors"
          >
            My Orders
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Image gallery */}
          <div className="space-y-3">
            <div className="aspect-square rounded-2xl overflow-hidden bg-white border border-amber-100 shadow-sm flex items-center justify-center">
              {images.length > 0 ? (
                <img
                  src={images[activeImage]}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-amber-300 select-none">
                  <svg
                    width="72"
                    height="72"
                    viewBox="0 0 72 72"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
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
                      i === activeImage
                        ? 'border-amber-500'
                        : 'border-transparent hover:border-amber-200'
                    }`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
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
              <h1 className="text-2xl font-bold text-gray-900 leading-snug">{item.name}</h1>
              {item.sku && (
                <p className="text-xs text-gray-400 font-mono mt-1">{item.sku}</p>
              )}
            </div>

            {/* Specs */}
            <div className="bg-white rounded-xl border border-amber-100 divide-y divide-amber-50">
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
                <span className="text-sm text-gray-500">HUID</span>
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
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live · refreshes every 30s
                  </span>
                </div>
              </div>
              {item.rateSnappedAt && (
                <p className="text-xs text-amber-300 mt-2">
                  Rate as of {new Date(item.rateSnappedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
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

            <p className="text-xs text-gray-400 text-center leading-relaxed">
              Reservations hold the item for 48 hours. Price shown is indicative and may vary at billing.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}
