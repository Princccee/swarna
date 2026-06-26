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
const CatalogueHomePage = lazy(() => import('@/pages/catalogue/CatalogueHomePage'));
const CatalogueBrowsePage = lazy(() => import('@/pages/catalogue/CatalogueBrowsePage'));
const CatalogueItemPage = lazy(() => import('@/pages/catalogue/CatalogueItemPage'));
const CatalogueLoginPage = lazy(() => import('@/pages/catalogue/CatalogueLoginPage'));
const CatalogueRegisterPage = lazy(() => import('@/pages/catalogue/CatalogueRegisterPage'));
const MyOrdersPage = lazy(() => import('@/pages/catalogue/MyOrdersPage'));
import { Role } from '@svarna/shared-types';
import { OfflineBanner } from '@/components/shared/OfflineBanner';

const InventoryListPage = lazy(() => import('@/pages/owner/InventoryListPage'));
const InventoryNewPage = lazy(() => import('@/pages/owner/InventoryNewPage'));
const InventoryDetailPage = lazy(() => import('@/pages/owner/InventoryDetailPage'));
const CategoriesPage = lazy(() => import('@/pages/owner/CategoriesPage'));
const RatesPage = lazy(() => import('@/pages/owner/RatesPage'));
const InvoiceListPage = lazy(() => import('@/pages/pos/InvoiceListPage'));
const InvoiceDetailPage = lazy(() => import('@/pages/pos/InvoiceDetailPage'));
const OrdersPage = lazy(() => import('@/pages/owner/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/pages/owner/OrderDetailPage'));
const OrderNewPage = lazy(() => import('@/pages/owner/OrderNewPage'));
const KarigarPage = lazy(() => import('@/pages/owner/KarigarPage'));

const Spin = () => <div className="flex items-center justify-center h-full p-8 text-gray-400">Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Spin />}>
      <OfflineBanner />
      <Routes>
        {/* Public */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/catalogue" element={<CatalogueHomePage />} />
        <Route path="/catalogue/browse" element={<CatalogueBrowsePage />} />
        <Route path="/catalogue/items/:id" element={<CatalogueItemPage />} />
        <Route path="/catalogue/login" element={<CatalogueLoginPage />} />
        <Route path="/catalogue/register" element={<CatalogueRegisterPage />} />
        <Route path="/catalogue/my-orders" element={<MyOrdersPage />} />

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
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/new" element={<OrderNewPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="karigar" element={<KarigarPage />} />
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
          <Route path="invoices" element={<InvoiceListPage />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
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
