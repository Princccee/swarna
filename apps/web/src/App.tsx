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
import { CUSTOMER_PORTAL_ENABLED } from '@/lib/features';

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
// Karigar page hidden for now: const KarigarPage = lazy(() => import('@/pages/owner/KarigarPage'));

const SalesRegisterPage = lazy(() => import('@/pages/accountant/SalesRegisterPage'));
const GstRegisterPage = lazy(() => import('@/pages/accountant/GstRegisterPage'));
const HuidLogPage = lazy(() => import('@/pages/accountant/HuidLogPage'));
const StockAuditPage = lazy(() => import('@/pages/accountant/StockAuditPage'));
const AuditTrailPage = lazy(() => import('@/pages/accountant/AuditTrailPage'));
const KycRegisterPage = lazy(() => import('@/pages/accountant/KycRegisterPage'));
const SettingsPage = lazy(() => import('@/pages/owner/SettingsPage'));
const MarketingPage = lazy(() => import('@/pages/owner/MarketingPage'));
const CampaignNewPage = lazy(() => import('@/pages/owner/CampaignNewPage'));
const CampaignDetailPage = lazy(() => import('@/pages/owner/CampaignDetailPage'));
const TemplatesPage = lazy(() => import('@/pages/owner/TemplatesPage'));
const ShareKitPage = lazy(() => import('@/pages/owner/ShareKitPage'));
const LendingListPage = lazy(() => import('@/pages/lending/LendingListPage'));
const LendingNewPage = lazy(() => import('@/pages/lending/LendingNewPage'));
const LendingDetailPage = lazy(() => import('@/pages/lending/LendingDetailPage'));
const HomePage = lazy(() => import('@/pages/home/HomePage'));

const Spin = () => <div className="flex items-center justify-center h-full p-8 text-gray-400">Loading…</div>;

export default function App() {
  return (
    <Suspense fallback={<Spin />}>
      <OfflineBanner />
      <Routes>
        {/* Public */}
        <Route path="/auth/login" element={<LoginPage />} />

        {/* Customer-facing pages — off until the customer portal is ready (see lib/features.ts) */}
        {CUSTOMER_PORTAL_ENABLED && (
          <>
            <Route path="/catalogue" element={<CatalogueHomePage />} />
            <Route path="/catalogue/browse" element={<CatalogueBrowsePage />} />
            <Route path="/catalogue/items/:id" element={<CatalogueItemPage />} />
            <Route path="/catalogue/login" element={<CatalogueLoginPage />} />
            <Route path="/catalogue/register" element={<CatalogueRegisterPage />} />
            <Route path="/catalogue/my-orders" element={<MyOrdersPage />} />
          </>
        )}

        {/* Owner */}
        <Route
          path="/owner"
          element={
            <ProtectedRoute roles={[Role.OWNER]}>
              <OwnerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="dashboard" element={<OwnerDashboard />} />
          <Route path="inventory" element={<InventoryListPage />} />
          <Route path="inventory/new" element={<InventoryNewPage />} />
          <Route path="inventory/categories" element={<CategoriesPage />} />
          <Route path="inventory/:id" element={<InventoryDetailPage />} />
          <Route path="rates" element={<RatesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/new" element={<OrderNewPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="invoices" element={<InvoiceListPage />} />
          <Route path="invoices/:id" element={<InvoiceDetailPage />} />
          {/* Karigar hidden for now (see OwnerLayout nav) */}
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="marketing/campaigns/new" element={<CampaignNewPage />} />
          <Route path="marketing/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="marketing/templates" element={<TemplatesPage />} />
          <Route path="marketing/share" element={<ShareKitPage />} />
          <Route path="lending" element={<LendingListPage />} />
          <Route path="lending/new" element={<LendingNewPage />} />
          <Route path="lending/:id" element={<LendingDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
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
          <Route path="lending" element={<LendingListPage />} />
          <Route path="lending/new" element={<LendingNewPage />} />
          <Route path="lending/:id" element={<LendingDetailPage />} />
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
          <Route path="registers/sales" element={<SalesRegisterPage />} />
          <Route path="registers/gst" element={<GstRegisterPage />} />
          <Route path="registers/huid" element={<HuidLogPage />} />
          <Route path="registers/stock" element={<StockAuditPage />} />
          <Route path="registers/kyc" element={<KycRegisterPage />} />
          <Route path="audit" element={<AuditTrailPage />} />
        </Route>

        <Route
          path="/"
          element={CUSTOMER_PORTAL_ENABLED ? <HomePage /> : <Navigate to="/auth/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
