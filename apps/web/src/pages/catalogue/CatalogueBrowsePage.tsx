import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { LanguageToggle } from '../../components/shared/LanguageToggle';
import { CategoryRail } from '../../components/catalogue/CategoryRail';

// ─── Constants ────────────────────────────────────────────────────────────────

const PURITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Purities' },
  { value: 'GOLD_24K', label: '24K Gold' },
  { value: 'GOLD_22K', label: '22K Gold' },
  { value: 'GOLD_18K', label: '18K Gold' },
  { value: 'GOLD_14K', label: '14K Gold' },
  { value: 'SILVER_999', label: 'Silver 999' },
  { value: 'SILVER_925', label: 'Silver 925' },
  { value: 'PLATINUM_950', label: 'Platinum 950' },
];

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: '24K',
  GOLD_22K: '22K',
  GOLD_18K: '18K',
  GOLD_14K: '14K',
  SILVER_999: 'Ag 999',
  SILVER_925: 'Ag 925',
  PLATINUM_950: 'Pt 950',
};

const PURITY_HUE: Record<string, string> = {
  GOLD_24K: '#B8860B',
  GOLD_22K: '#C8961C',
  GOLD_18K: '#D4A02A',
  GOLD_14K: '#D9AE3A',
  SILVER_999: '#A0A8B0',
  SILVER_925: '#8E9AA4',
  PLATINUM_950: '#7B8FA0',
};

const PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogueItem {
  id: string;
  name: string;
  purity: string;
  netWeightG: string | number;
  indicativePrice?: number | null;
  category?: { id: string; name: string } | null;
  imageUrls?: string[];
}

interface Meta {
  total: number;
  page: number;
  totalPages: number;
}

interface CatalogueItemsResponse {
  items: CatalogueItem[];
  meta: Meta;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImagePlaceholder({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #2a2018 0%, #1e1610 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        aspectRatio: '1',
      }}
    >
      <span
        style={{
          fontSize: '1.75rem',
          fontWeight: 600,
          color: '#c8860a',
          letterSpacing: '0.05em',
          userSelect: 'none',
        }}
      >
        {initials}
      </span>
    </div>
  );
}

function PurityBadge({ purity }: { purity: string }) {
  const label = PURITY_LABELS[purity] ?? purity;
  const color = PURITY_HUE[purity] ?? '#A0A0A0';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: '4px',
        padding: '2px 7px',
      }}
    >
      {label}
    </span>
  );
}

function ItemCard({
  item,
  isAuthenticated,
  onReserve,
}: {
  item: CatalogueItem;
  isAuthenticated: boolean;
  onReserve: (item: CatalogueItem) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <article
      onClick={() => navigate(`/catalogue/items/${item.id}`)}
      style={{
        background: '#181411',
        border: '1px solid #2e2720',
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(0,0,0,0.5)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLElement).style.borderColor = '#c8860a';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = '#2e2720';
      }}
    >
      {/* Image area */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {item.imageUrls?.[0] ? (
          <img
            src={item.imageUrls[0]}
            alt={item.name}
            style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <ImagePlaceholder name={item.name} />
        )}
        <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
          <PurityBadge purity={item.purity} />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          padding: '14px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: 1,
        }}
      >
        {item.category?.name && (
          <p
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#7a6a55',
              margin: 0,
            }}
          >
            {item.category.name}
          </p>
        )}

        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            color: '#ede0c8',
            margin: 0,
            lineHeight: 1.35,
          }}
        >
          {item.name}
        </h3>

        <p style={{ fontSize: '0.78rem', color: '#7a6a55', margin: 0 }}>
          {t('catalogue.browse.net_wt')} {Number(item.netWeightG).toFixed(3)} g
        </p>

        {/* Price row */}
        <div style={{ marginTop: '6px', minHeight: '1.5rem' }}>
          {item.indicativePrice != null ? (
            <p
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                color: '#e8a030',
                margin: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ₹{item.indicativePrice.toLocaleString('en-IN')}
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 400,
                  color: '#7a6a55',
                  marginLeft: '4px',
                  letterSpacing: '0.02em',
                }}
              >
                {t('catalogue.browse.indicative')}
              </span>
            </p>
          ) : (
            <p style={{ fontSize: '0.78rem', color: '#5a4e40', fontStyle: 'italic', margin: 0 }}>
              {t('catalogue.browse.price_on_request')}
            </p>
          )}
        </div>

        {/* Reserve button */}
        <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
          {isAuthenticated ? (
            <button
              onClick={(e) => { e.stopPropagation(); onReserve(item); }}
              style={{
                width: '100%',
                padding: '8px 0',
                background: '#c8860a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.03em',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#a86e08';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#c8860a';
              }}
            >
              {t('catalogue.browse.reserve')}
            </button>
          ) : (
            <Link
              to="/catalogue/login"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'block',
                textAlign: 'center',
                width: '100%',
                padding: '8px 0',
                background: 'transparent',
                color: '#e8a030',
                border: '1px solid #5a3e10',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.03em',
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              {t('catalogue.browse.login_to_reserve')}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#181411',
        border: '1px solid #2e2720',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          background: 'linear-gradient(90deg, #201c17 25%, #2a2318 50%, #201c17 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }}
      />
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ height: '10px', width: '50%', background: '#2e2720', borderRadius: '4px' }} />
        <div style={{ height: '14px', width: '80%', background: '#251f18', borderRadius: '4px' }} />
        <div style={{ height: '10px', width: '40%', background: '#2e2720', borderRadius: '4px' }} />
        <div style={{ height: '32px', width: '100%', background: '#3a2a10', borderRadius: '6px', marginTop: '8px' }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogueBrowsePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Derive filter state from URL search params
  const categoryId = searchParams.get('categoryId') ?? '';
  const [purity, setPurity] = useState(searchParams.get('purity') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? '1'));

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Sync filter changes back to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (categoryId) params.categoryId = categoryId;
    if (purity) params.purity = purity;
    if (debouncedSearch) params.search = debouncedSearch;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [categoryId, purity, debouncedSearch, page, setSearchParams]);

  const { data: categoriesData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['catalogue-categories'],
    queryFn: () => api.get('/catalogue/categories').then((r: any) => r.data?.categories ?? r.data ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const categories = categoriesData ?? [];

  const { data, isLoading, isError } = useQuery<CatalogueItemsResponse>({
    queryKey: ['catalogue-items', categoryId, purity, debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (categoryId) params.set('categoryId', categoryId);
      if (purity) params.set('purity', purity);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return api.get(`/catalogue/items?${params}`).then((r: any) => r.data);
    },
    placeholderData: keepPreviousData,
  });

  const items: CatalogueItem[] = data?.items ?? [];
  const meta: Meta | undefined = data?.meta;

  function handleCategoryChange(id: string) {
    const params: Record<string, string> = {};
    if (id) params.categoryId = id;
    if (purity) params.purity = purity;
    if (debouncedSearch) params.search = debouncedSearch;
    setSearchParams(params, { replace: true });
    setPage(1);
  }

  function handleReserve(item: CatalogueItem) {
    // Reservation flow — placeholder for phase implementation
    alert(`Reserve request for "${item.name}" noted. Our team will contact you shortly.`);
  }

  function handlePurityChange(v: string) {
    setPurity(v);
    setPage(1);
  }

  function handleSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }

  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: '#0c0a08',
          paddingBottom: '48px',
        }}
      >
        {/* Header strip */}
        <div
          style={{
            background: '#181411',
            borderBottom: '1px solid #2e2720',
            padding: '20px 24px',
          }}
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <h1
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#ede0c8',
                  margin: '0 0 2px',
                  letterSpacing: '-0.01em',
                }}
              >
                {t('catalogue.browse.title')}
              </h1>
              {categoryId && (
                <p style={{ fontSize: '0.82rem', color: '#7a6a55', margin: 0 }}>
                  {t('catalogue.browse.filtered')}
                </p>
              )}
            </div>
            <LanguageToggle dark />
          </div>
        </div>

        {/* Category rail — only shown when categories exist */}
        {categories.length > 0 && (
          <div style={{ background: '#181411', borderBottom: '1px solid #2e2720', padding: '0 24px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 0' }}>
              <CategoryRail
                categories={categories}
                activeCategoryId={categoryId}
                onChange={handleCategoryChange}
                dark
              />
            </div>
          </div>
        )}

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 24px 0' }}>
          {/* Filter bar */}
          <div
            style={{
              background: '#181411',
              border: '1px solid #2e2720',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px', maxWidth: '320px' }}>
              <svg
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#7a6a55',
                  pointerEvents: 'none',
                }}
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
              >
                <path
                  d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-.657 3.757 2.9 2.9-.707.707-2.9-2.9a4.5 4.5 0 1 1 .707-.707Z"
                  fill="currentColor"
                />
              </svg>
              <input
                type="search"
                placeholder={t('catalogue.browse.search_placeholder')}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '32px',
                  paddingRight: '12px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  border: '1px solid #3a3228',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: '#ede0c8',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#201c17',
                }}
              />
            </div>

            {/* Purity select */}
            <select
              value={purity}
              onChange={(e) => handlePurityChange(e.target.value)}
              style={{
                flex: '0 0 auto',
                padding: '8px 12px',
                border: '1px solid #3a3228',
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: purity ? '#ede0c8' : '#7a6a55',
                background: '#201c17',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {PURITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Active filters summary */}
            {(purity || debouncedSearch || categoryId) && (
              <button
                onClick={() => {
                  setPurity('');
                  setSearch('');
                  setPage(1);
                  setSearchParams({}, { replace: true });
                }}
                style={{
                  marginLeft: 'auto',
                  fontSize: '0.78rem',
                  color: '#7a6a55',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: '0 4px',
                }}
              >
                {t('catalogue.browse.clear_filters')}
              </button>
            )}
          </div>

          {/* Result count */}
          {!isLoading && !isError && total > 0 && (
            <p
              style={{
                fontSize: '0.8rem',
                color: '#7a6a55',
                marginBottom: '16px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('catalogue.browse.showing', { start: rangeStart, end: rangeEnd, total })}
            </p>
          )}

          {/* Error state */}
          {isError && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: '#e07070',
                background: '#1a1010',
                border: '1px solid #4a2020',
                borderRadius: '10px',
              }}
            >
              {t('catalogue.browse.load_error')}
            </div>
          )}

          {/* Grid */}
          {!isError && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: '20px',
                marginBottom: '32px',
              }}
            >
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                : items.length === 0
                ? null
                : items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      isAuthenticated={isAuthenticated}
                      onReserve={handleReserve}
                    />
                  ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && items.length === 0 && (
            <div
              style={{
                padding: '64px 32px',
                textAlign: 'center',
                color: '#7a6a55',
                background: '#181411',
                border: '1px solid #2e2720',
                borderRadius: '10px',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.4 }}>◇</div>
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: '#ede0c8' }}>
                {t('catalogue.browse.no_items')}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
                {t('catalogue.browse.no_items_hint')}
              </p>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  color: '#7a6a55',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('catalogue.browse.page_of', { page, total: totalPages })}
              </span>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  style={{
                    padding: '7px 16px',
                    border: '1px solid #3a3228',
                    borderRadius: '6px',
                    background: '#201c17',
                    fontSize: '0.83rem',
                    fontWeight: 500,
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    opacity: page === 1 ? 0.4 : 1,
                    color: '#ede0c8',
                  }}
                >
                  {t('catalogue.browse.prev')}
                </button>

                {/* Page number chips — show up to 5 around current */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - page) <= 1
                  )
                  .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === 'ellipsis' ? (
                      <span
                        key={`ell-${idx}`}
                        style={{
                          padding: '7px 4px',
                          fontSize: '0.83rem',
                          color: '#7a6a55',
                        }}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        style={{
                          padding: '7px 12px',
                          border: '1px solid',
                          borderColor: page === p ? '#c8860a' : '#3a3228',
                          borderRadius: '6px',
                          background: page === p ? '#c8860a' : '#201c17',
                          color: page === p ? '#fff' : '#ede0c8',
                          fontSize: '0.83rem',
                          fontWeight: page === p ? 600 : 400,
                          cursor: 'pointer',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  style={{
                    padding: '7px 16px',
                    border: '1px solid #3a3228',
                    borderRadius: '6px',
                    background: '#201c17',
                    fontSize: '0.83rem',
                    fontWeight: 500,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages ? 0.4 : 1,
                    color: '#ede0c8',
                  }}
                >
                  {t('catalogue.browse.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
