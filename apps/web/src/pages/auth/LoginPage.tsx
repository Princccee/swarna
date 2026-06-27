import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/stores/theme.store';
import { toast } from 'sonner';
import { Role } from '@svarna/shared-types';

export function LoginPage() {
  const [email, setEmail] = useState('owner@svarna.local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, user, getHomeRoute } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useThemeStore();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getHomeRoute(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate, getHomeRoute]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
      const from = (location.state as any)?.from?.pathname;
      navigate(from || getHomeRoute(result.user.role as Role), { replace: true });
    } catch {
      toast.error('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const bgStyle = theme === 'dark'
    ? { background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(28 18% 12%) 0%, hsl(28 15% 8%) 100%)' }
    : { background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(44 60% 94%) 0%, hsl(38 30% 88%) 100%)' };

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={bgStyle}>
      {/* Theme toggle — top-right */}
      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 text-muted-foreground/60 hover:text-amber-500 transition-colors"
      >
        {theme === 'dark'
          ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        }
      </button>

      <div className="w-full max-w-sm px-4 animate-fade-in">

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">

          {/* Top accent stripe */}
          <div className="h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />

          <div className="px-8 py-8">
            {/* Brand mark */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-700/40 mb-4">
                <span className="text-amber-600 dark:text-amber-400 text-xl select-none leading-none">◆</span>
              </div>
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">
                Svarna Jewels
              </h1>
              <p className="text-[12px] text-muted-foreground uppercase tracking-[0.14em] mt-1.5">
                Management Console
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@svarna.local"
                  required
                  className="w-full px-3.5 py-2.5 border border-border rounded-lg text-[14px] text-foreground bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 border border-border rounded-lg text-[14px] text-foreground bg-background placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white tracking-wide transition-colors disabled:opacity-60 mt-1"
                style={{ background: loading ? '#c49a1f' : '#B8880F' }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = '#9A7200'); }}
                onMouseLeave={(e) => { if (!loading) (e.currentTarget.style.background = '#B8880F'); }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] text-muted-foreground mt-5">
          Default:{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
            owner@svarna.local
          </code>
          {' / '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
            svarna@2026
          </code>
        </p>
      </div>
    </div>
  );
}
