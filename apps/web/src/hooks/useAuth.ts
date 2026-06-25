import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Role } from '@svarna/shared-types';

export function useAuth() {
  const store = useAuthStore();
  const navigate = useNavigate();

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    store.setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
    return data.data;
  };

  const logout = async () => {
    try {
      if (store.refreshToken) {
        await api.post('/auth/logout', { refreshToken: store.refreshToken });
      }
    } catch {
      // silent — always clear local state
    } finally {
      store.logout();
      navigate('/auth/login');
    }
  };

  const getHomeRoute = (role: Role): string => {
    const routes: Record<Role, string> = {
      [Role.OWNER]: '/owner',
      [Role.STAFF]: '/pos',
      [Role.ACCOUNTANT]: '/accountant',
      [Role.CUSTOMER]: '/catalogue',
    };
    return routes[role] || '/auth/login';
  };

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    login,
    logout,
    getHomeRoute,
  };
}
