import { lazy, Suspense } from 'react';
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

const InventoryListPage = lazy(() => import('@/pages/owner/InventoryListPage'));
const InventoryNewPage = lazy(() => import('@/pages/owner/InventoryNewPage'));
const InventoryDetailPage = lazy(() => import('@/pages/owner/InventoryDetailPage'));
const CategoriesPage = lazy(() => import('@/pages/owner/CategoriesPage'));
const RatesPage = lazy(() => import('@/pages/owner/RatesPage'));

const Spin = () => <div className="flex items-center justify-center h-full p-8 text-gray-400">Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Spin />}>
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
          <Route path="inventory" element={<InventoryListPage />} />
          <Route path="inventory/new" element={<InventoryNewPage />} />
          <Route path="inventory/categories" element={<CategoriesPage />} />
          <Route path="inventory/:id" element={<InventoryDetailPage />} />
          <Route path="rates" element={<RatesPage />} />
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
    </Suspense>
  );
}
