import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

export default function CatalogueLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api
        .post('/catalogue/auth/login', { phone, password })
        .then((r: any) => r.data);
      const token = res.token ?? res.data?.token ?? res.accessToken ?? res.data?.accessToken;
      if (!token) throw new Error('No token in response');
      localStorage.setItem('catalogue_token', token);
      navigate('/catalogue/browse', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Invalid phone number or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Language toggle */}
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💍</div>
          <h1 className="text-3xl font-bold text-primary">{t('common.brand')}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t('catalogue.login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-amber-100 shadow-sm p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">
              {t('catalogue.login.phone')}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              required
              autoFocus
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">
              {t('catalogue.login.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm tracking-wide transition-colors mt-1"
          >
            {loading ? t('catalogue.login.submitting') : t('catalogue.login.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5">
          {t('catalogue.login.new_customer')}{' '}
          <Link to="/catalogue/register" className="text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2">
            {t('catalogue.login.register')}
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground/60 mt-4">
          <Link to="/catalogue/browse" className="hover:text-muted-foreground underline underline-offset-2">
            {t('catalogue.login.continue_browsing')}
          </Link>
        </p>
      </div>
    </div>
  );
}
