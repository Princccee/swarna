import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Role } from '@svarna/shared-types';

interface Props {
  children: React.ReactNode;
  roles?: Role[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    const redirects: Record<Role, string> = {
      [Role.OWNER]: '/owner',
      [Role.STAFF]: '/pos',
      [Role.ACCOUNTANT]: '/accountant',
      [Role.CUSTOMER]: '/catalogue',
    };
    return <Navigate to={redirects[user.role] || '/auth/login'} replace />;
  }

  return <>{children}</>;
}
