import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

interface Category {
  id: string;
  name: string;
}

export default function CatalogueHomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/catalogue/categories')
      .then((r: any) => {
        const data = r.data?.data ?? r.data ?? [];
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => setError(t('catalogue.home.loading_error')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="min-h-screen bg-amber-50" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-card border-b border-amber-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link
            to="/catalogue"
            className="text-xl font-bold tracking-tight"
            style={{ color: 'hsl(38 89% 38%)' }}
          >
            {t('common.brand')}
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/catalogue"
              className="px-3 py-1.5 text-sm font-medium rounded-md text-amber-900 hover:bg-amber-100 transition-colors"
            >
              {t('common.home')}
            </Link>
            <Link
              to="/catalogue/browse"
              className="px-3 py-1.5 text-sm font-medium rounded-md text-amber-900 hover:bg-amber-100 transition-colors"
            >
              {t('common.browse')}
            </Link>
            <Link
              to="/catalogue/orders"
              className="px-3 py-1.5 text-sm font-medium rounded-md text-amber-900 hover:bg-amber-100 transition-colors"
            >
              {t('common.myOrders')}
            </Link>
            <Link
              to="/auth/login"
              className="ml-2 px-4 py-1.5 text-sm font-semibold rounded-md text-white transition-colors"
              style={{ backgroundColor: 'hsl(38 89% 38%)' }}
            >
              {t('common.login')}
            </Link>
            <LanguageToggle />
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, hsl(38 89% 22%) 0%, hsl(38 75% 38%) 50%, hsl(43 90% 48%) 100%)',
          minHeight: '340px',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 rounded-full border-2 opacity-10"
          style={{ width: '480px', height: '480px', borderColor: 'hsl(43 90% 70%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute -right-8 top-8 rounded-full border opacity-10"
          style={{ width: '320px', height: '320px', borderColor: 'hsl(43 90% 80%)' }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 flex flex-col items-start">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: 'hsl(43 90% 72%)' }}
          >
            {t('catalogue.home.pretitle')}
          </p>
          <h1
            className="text-4xl sm:text-5xl font-bold leading-tight max-w-lg"
            style={{ color: '#fff', textWrap: 'balance' } as React.CSSProperties}
          >
            {t('catalogue.home.title')}
          </h1>
          <p className="mt-4 text-base max-w-md" style={{ color: 'hsl(43 60% 88%)' }}>
            {t('catalogue.home.subtitle')}
          </p>
          <Link
            to="/catalogue/browse"
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-md font-semibold text-sm transition-colors"
            style={{ backgroundColor: 'hsl(43 90% 58%)', color: 'hsl(38 89% 14%)' }}
          >
            {t('catalogue.home.cta')}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Category Grid ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'hsl(38 89% 22%)' }}>
          {t('catalogue.home.categories_title')}
        </h2>
        <p className="text-sm mb-8" style={{ color: 'hsl(38 30% 48%)' }}>
          {t('catalogue.home.categories_subtitle')}
        </p>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg animate-pulse" style={{ backgroundColor: 'hsl(38 70% 88%)' }} />
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm py-8 text-center" style={{ color: 'hsl(0 60% 45%)' }}>{error}</p>
        )}

        {!loading && !error && categories.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: 'hsl(38 30% 48%)' }}>
            {t('catalogue.home.empty')}
          </p>
        )}

        {!loading && !error && categories.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/catalogue/browse?categoryId=${cat.id}`)}
                className="group relative h-24 rounded-lg text-left overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ backgroundColor: 'hsl(43 85% 88%)', '--tw-ring-color': 'hsl(38 89% 38%)' } as React.CSSProperties}
              >
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'hsl(43 85% 82%)' }} aria-hidden="true" />
                <span className="relative flex flex-col justify-end h-full p-4">
                  <span className="text-sm font-semibold leading-snug" style={{ color: 'hsl(38 89% 18%)' }}>
                    {cat.name}
                  </span>
                  <span className="text-xs mt-0.5 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: 'hsl(38 60% 28%)' }}>
                    {t('catalogue.home.explore')}
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-amber-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm font-semibold" style={{ color: 'hsl(38 89% 38%)' }}>
            {t('common.brand')}
          </span>
          <p className="text-xs" style={{ color: 'hsl(38 30% 55%)' }}>
            {t('catalogue.home.footer_copy', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
