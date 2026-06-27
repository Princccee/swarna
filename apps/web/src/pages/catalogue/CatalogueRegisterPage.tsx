import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { LanguageToggle } from '../../components/shared/LanguageToggle';

export default function CatalogueRegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError(t('catalogue.register.err_mismatch'));
      return;
    }
    if (form.password.length < 6) {
      setError(t('catalogue.register.err_short'));
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, string> = { name: form.name, phone: form.phone, password: form.password };
      if (form.email.trim()) payload.email = form.email.trim();

      const res = await api.post('/catalogue/auth/register', payload).then((r: any) => r.data);
      const token = res.token ?? res.data?.token ?? res.accessToken ?? res.data?.accessToken;
      if (!token) throw new Error('No token in response');
      localStorage.setItem('catalogue_token', token);
      navigate('/catalogue/browse', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('catalogue.register.err_default'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Language toggle */}
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💍</div>
          <h1 className="text-3xl font-bold text-primary">{t('common.brand')}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t('catalogue.register.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-amber-100 shadow-sm p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">{t('catalogue.register.full_name')}</label>
            <input type="text" value={form.name} onChange={set('name')} placeholder={t('catalogue.register.full_name')} required autoFocus
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">{t('catalogue.register.phone')}</label>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. 9876543210" required
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">
              {t('catalogue.register.email')}{' '}
              <span className="text-muted-foreground/60 font-normal">{t('catalogue.register.optional')}</span>
            </label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com"
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">{t('catalogue.register.password')}</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder={t('catalogue.register.password_hint')} required
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-1.5">{t('catalogue.register.confirm_password')}</label>
            <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder={t('catalogue.register.confirm_placeholder')} required
              className="w-full px-3 py-2.5 border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-amber-400 transition" />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm tracking-wide transition-colors mt-1">
            {loading ? t('catalogue.register.submitting') : t('catalogue.register.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5">
          {t('catalogue.register.have_account')}{' '}
          <Link to="/catalogue/login" className="text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2">
            {t('common.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
