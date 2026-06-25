import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Role } from '@svarna/shared-types';

export function LoginPage() {
  const [email, setEmail] = useState('owner@svarna.local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, user, getHomeRoute } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">💍</div>
          <h1 className="text-3xl font-bold text-primary">Svarna Jewels</h1>
          <p className="text-muted-foreground mt-2 text-sm">Sign in to your account</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 bg-card p-6 rounded-xl border shadow-sm"
        >
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@svarna.local"
              required
              className="w-full px-3 py-2.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Default credentials: <code className="bg-muted px-1 rounded">owner@svarna.local</code> /{' '}
          <code className="bg-muted px-1 rounded">svarna@2026</code>
        </p>
      </div>
    </div>
  );
}
