import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OwnerLayout } from '@/components/layouts/OwnerLayout';
import { PosLayout } from '@/components/layouts/PosLayout';
import { AccountantLayout } from '@/components/layouts/AccountantLayout';
import { OwnerDashboard } from '@/pages/owner/OwnerDashboard';
import { PosPage } from '@/pages/pos/PosPage';
import { AccountantDashboard } from '@/pages/accountant/AccountantDashboard';
import { CataloguePage } from '@/pages/catalogue/CataloguePage';
import { Role } from '@svarna/shared-types';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/catalogue/*" element={<CataloguePage />} />

      {/* Owner */}
      <Route
        path="/owner"
        element={
          <ProtectedRoute roles={[Role.OWNER]}>
            <OwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OwnerDashboard />} />
        <Route path="dashboard" element={<OwnerDashboard />} />
      </Route>

      {/* POS */}
      <Route
        path="/pos"
        element={
          <ProtectedRoute roles={[Role.OWNER, Role.STAFF]}>
            <PosLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PosPage />} />
      </Route>

      {/* Accountant */}
      <Route
        path="/accountant"
        element={
          <ProtectedRoute roles={[Role.OWNER, Role.ACCOUNTANT]}>
            <AccountantLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AccountantDashboard />} />
      </Route>

      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}
