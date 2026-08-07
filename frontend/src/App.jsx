import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, Navigate } from 'react-router-dom'
import { applyDirection } from './i18n/rtl'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import PropertyList from './pages/PropertyList'
import PropertyDetail from './pages/PropertyDetail'
import AgencyList from './pages/AgencyList'
import AgencyDetail from './pages/AgencyDetail'
import AgencyPricing from './pages/AgencyPricing'
import Services from './pages/Services'
import Contact from './pages/Contact'
import SellProperty from './pages/SellProperty'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import AcceptInvitation from './pages/auth/AcceptInvitation'
import About from './pages/About'
import LegalPage from './pages/LegalPage'
import CheckoutConfirmation from './pages/CheckoutConfirmation'
import PaymentGateway from './pages/PaymentGateway'
import Dashboard from './pages/dashboard/Dashboard'
import MyProperties from './pages/dashboard/MyProperties'
import CreateProperty from './pages/dashboard/CreateProperty'
import MyLeads from './pages/dashboard/MyLeads'
import MyApplications from './pages/dashboard/MyApplications'
import MyApplicationDetail from './pages/dashboard/MyApplicationDetail'
import MyAgency from './pages/dashboard/MyAgency'
import Checkout from './pages/Checkout'
import NotFound from './pages/NotFound'
import PrivateRoute from './components/auth/PrivateRoute'
import ProgramList from './pages/ProgramList'
import ProgramDetail from './pages/ProgramDetail'
import DashboardPrograms from './pages/dashboard/Programs'
import DashboardProgramForm from './pages/dashboard/ProgramForm'
import ProgramPlanEditor from './pages/dashboard/ProgramPlanEditor'
import MarketPrices from './pages/dashboard/MarketPrices'
import StayManagerTabs from './pages/dashboard/integrations/StayManagerTabs'
import StayManagerIntegration from './pages/dashboard/integrations/StayManager'
import StayManagerProperties from './pages/dashboard/integrations/StayManagerProperties'
import StayManagerReservations from './pages/dashboard/integrations/StayManagerReservations'
import AccountTabs from './pages/dashboard/AccountTabs'
import SuperAdminRoute from './components/auth/SuperAdminRoute'
import AdminLayout from './pages/admin/AdminLayout'
import AdminOverview from './pages/admin/AdminOverview'
import AdminAccounts from './pages/admin/AdminAccounts'
import AdminAccountDetail from './pages/admin/AdminAccountDetail'
import AdminSharedArtisans from './pages/admin/AdminSharedArtisans'
import AdminProducts from './pages/admin/AdminProducts'
import AdminOrders from './pages/admin/AdminOrders'
import SavedSearches from './pages/dashboard/SavedSearches'
import BuyerMessages from './pages/dashboard/BuyerMessages'
import AgencyMessages from './pages/dashboard/AgencyMessages'
import Availability from './pages/dashboard/Availability'
import MortgageSimulator from './pages/MortgageSimulator'
import CompareProperties from './pages/CompareProperties'

// Backoffice imports
import BackofficeLayout from './pages/backoffice/components/BackofficeLayout'
import BackofficeDashboard from './pages/backoffice/Dashboard'
import BackofficeProperties from './pages/backoffice/Properties'
import BackofficePropertyForm from './pages/backoffice/PropertyForm'
import BackofficeClients from './pages/backoffice/Clients'
import BackofficeClientForm from './pages/backoffice/ClientForm'
import BackofficeClientDetail from './pages/backoffice/ClientDetail'
import BackofficeLeads from './pages/backoffice/Leads'
import BackofficeVisits from './pages/backoffice/Visits'
import BackofficePipeline from './pages/backoffice/Pipeline'
import BackofficeTransactions from './pages/backoffice/Transactions'
import TransactionCreate from './pages/backoffice/TransactionCreate'
import BackofficeTransactionDetail from './pages/backoffice/TransactionDetail'
import BackofficeTeam from './pages/backoffice/Team'
import OverviewAnalytics from './pages/backoffice/analytics/OverviewAnalytics'
import SettingsHub from './pages/backoffice/SettingsHub'
import BackofficeStripeConfig from './pages/backoffice/StripeConfig'
import ContractsList from './pages/backoffice/contracts/ContractsList'
import ContractCreate from './pages/backoffice/contracts/ContractCreate'
import ContractEditor from './pages/backoffice/contracts/ContractEditor'
import TemplatesManager from './pages/backoffice/contracts/TemplatesManager'
import NotariesDirectory from './pages/backoffice/legal/NotariesDirectory'
import NotairesLayout from './pages/backoffice/legal/NotairesLayout'
import ArtisansLayout from './pages/backoffice/artisans/ArtisansLayout'
import ArtisansDirectory from './pages/backoffice/artisans/ArtisansDirectory'
import WorkOrdersList from './pages/backoffice/artisans/WorkOrdersList'
import WorkOrderDetail from './pages/backoffice/artisans/WorkOrderDetail'
import RentalLayout from './pages/backoffice/rental/RentalLayout'
import MandatesList from './pages/backoffice/rental/MandatesList'
import MandateDetail from './pages/backoffice/rental/MandateDetail'
import LeasesList from './pages/backoffice/rental/LeasesList'
import LeaseDetail from './pages/backoffice/rental/LeaseDetail'
import ApplicationsList from './pages/backoffice/rental/ApplicationsList'
import ApplicationDetail from './pages/backoffice/rental/ApplicationDetail'
import InventoryEditor from './pages/backoffice/rental/InventoryEditor'
import SettlementEditor from './pages/backoffice/rental/SettlementEditor'
import LegalCasesList from './pages/backoffice/legal/LegalCasesList'
import LegalCaseDetail from './pages/backoffice/legal/LegalCaseDetail'
import AnalyticsLayout from './pages/backoffice/analytics/AnalyticsLayout'
import ShopCatalog from './pages/backoffice/shop/ShopCatalog'
import ProductDetail from './pages/backoffice/shop/ProductDetail'
import Cart from './pages/backoffice/shop/Cart'
import OrdersList from './pages/backoffice/shop/OrdersList'
import OrderDetail from './pages/backoffice/shop/OrderDetail'
import FinancialAnalytics from './pages/backoffice/analytics/FinancialAnalytics'
import MarketAnalytics from './pages/backoffice/analytics/MarketAnalytics'
import PipelineAnalytics from './pages/backoffice/analytics/PipelineAnalytics'
import TeamAnalytics from './pages/backoffice/analytics/TeamAnalytics'
import Subscription from './pages/dashboard/Subscription'
import ImpersonationBanner from './components/admin/ImpersonationBanner'

function App() {
  const { i18n } = useTranslation()
  useEffect(() => {
    applyDirection(i18n.language)
    const onChange = (lng) => applyDirection(lng)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [i18n])

  return (
    <>
      <ImpersonationBanner />
      <Routes>
      {/* Public routes */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="annonces" element={<PropertyList />} />
        <Route path="annonces/:id" element={<PropertyDetail />} />
        <Route path="programmes" element={<ProgramList />} />
        <Route path="programmes/:slug" element={<ProgramDetail />} />
        <Route path="agences" element={<AgencyList />} />
        <Route path="agences/tarifs" element={<AgencyPricing />} />
        <Route path="agences/:slug" element={<AgencyDetail />} />
        <Route path="nos-services" element={<Services />} />
        <Route path="nos-services/:service" element={<Services />} />
        <Route path="contact" element={<Contact />} />
        <Route path="vendre" element={<SellProperty />} />
        <Route path="connexion" element={<Login />} />
        <Route path="inscription" element={<Register />} />
        <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="reinitialiser-mot-de-passe" element={<ResetPassword />} />
        <Route path="invitation/:token" element={<AcceptInvitation />} />
        <Route path="a-propos" element={<About />} />
        <Route path="mentions-legales" element={<LegalPage type="mentions" />} />
        <Route path="cgu" element={<LegalPage type="cgu" />} />
        <Route path="politique-de-confidentialite" element={<LegalPage type="confidentialite" />} />
        <Route path="cookies" element={<LegalPage type="cookies" />} />
        <Route path="simulateur-credit" element={<MortgageSimulator />} />
        <Route path="comparer" element={<CompareProperties />} />

        {/* Protected routes */}
        <Route path="dashboard" element={<PrivateRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="annonces" element={<MyProperties />} />
          <Route path="annonces/nouvelle" element={<CreateProperty />} />
          <Route path="annonces/:id/modifier" element={<CreateProperty />} />
          <Route path="programmes" element={<DashboardPrograms />} />
          <Route path="programmes/nouveau" element={<DashboardProgramForm />} />
          <Route path="programmes/:id" element={<DashboardProgramForm />} />
          <Route path="programmes/:id/plan" element={<ProgramPlanEditor />} />
          <Route path="leads" element={<MyLeads />} />
          <Route path="candidatures" element={<MyApplications />} />
          <Route path="candidatures/:id" element={<MyApplicationDetail />} />

          {/* Mon compte : agence / abonnement / paramètres regroupés en onglets */}
          <Route path="compte" element={<AccountTabs />}>
            <Route index element={<Navigate to="agence" replace />} />
            <Route path="agence" element={<MyAgency />} />
            <Route path="abonnement" element={<Subscription />} />
            <Route path="parametres" element={<Navigate to="/backoffice/parametres" replace />} />
          </Route>
          {/* Anciennes URLs -> nouvelles (rétro-compatibilité) */}
          <Route path="agence" element={<Navigate to="/dashboard/compte/agence" replace />} />
          <Route path="abonnement" element={<Navigate to="/dashboard/compte/abonnement" replace />} />
          <Route path="parametres" element={<Navigate to="/dashboard/compte/parametres" replace />} />

          {/* Buyer-experience : recherches sauvegardées, messagerie, disponibilités */}
          <Route path="mes-recherches" element={<SavedSearches />} />
          <Route path="mes-messages" element={<BuyerMessages />} />
          <Route path="messages" element={<AgencyMessages />} />
          <Route path="disponibilites" element={<Availability />} />

          <Route path="prix-marche" element={<MarketPrices />} />

          {/* StayManager : connexion / biens / réservations regroupés en onglets */}
          <Route path="staymanager" element={<StayManagerTabs />}>
            <Route index element={<StayManagerIntegration />} />
            <Route path="biens" element={<StayManagerProperties />} />
            <Route path="reservations" element={<StayManagerReservations />} />
          </Route>
          {/* Anciennes URLs -> nouvelles (rétro-compatibilité) */}
          <Route path="integrations/staymanager" element={<Navigate to="/dashboard/staymanager" replace />} />
          <Route path="integrations/staymanager/properties" element={<Navigate to="/dashboard/staymanager/biens" replace />} />
          <Route path="integrations/staymanager/reservations" element={<Navigate to="/dashboard/staymanager/reservations" replace />} />
        </Route>

        {/* Checkout (protected) */}
        <Route path="checkout" element={<PrivateRoute />}>
          <Route index element={<Checkout />} />
          <Route path="confirmation" element={<CheckoutConfirmation />} />
        </Route>
        <Route path="payment-gateway" element={<PrivateRoute />}>
          <Route index element={<PaymentGateway />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Backoffice routes (protected) */}
      <Route path="/backoffice" element={<PrivateRoute />}>
        <Route element={<BackofficeLayout />}>
          <Route index element={<BackofficeDashboard />} />
          <Route path="biens" element={<BackofficeProperties />} />
          <Route path="biens/nouveau" element={<BackofficePropertyForm />} />
          <Route path="biens/:id" element={<BackofficePropertyForm />} />
          <Route path="clients" element={<BackofficeClients />} />
          <Route path="clients/nouveau" element={<BackofficeClientForm />} />
          <Route path="clients/:id" element={<BackofficeClientDetail />} />
          <Route path="clients/:id/modifier" element={<BackofficeClientForm />} />
          <Route path="leads" element={<BackofficeLeads />} />
          <Route path="visites" element={<BackofficeVisits />} />
          <Route path="visites/nouvelle" element={<BackofficeVisits />} />
          <Route path="pipeline" element={<BackofficePipeline />} />
          <Route path="transactions" element={<BackofficeTransactions />} />
          <Route path="transactions/nouveau" element={<TransactionCreate />} />
          <Route path="transactions/:id" element={<BackofficeTransactionDetail />} />
          <Route path="equipe" element={<BackofficeTeam />} />
          <Route path="statistiques" element={<Navigate to="/backoffice/analyses" replace />} />
          <Route path="parametres" element={<SettingsHub />} />
          <Route path="stripe" element={<BackofficeStripeConfig />} />
          <Route path="contrats" element={<ContractsList />} />
          <Route path="contrats/nouveau" element={<ContractCreate />} />
          <Route path="contrats/modeles" element={<TemplatesManager />} />
          <Route path="contrats/:id" element={<ContractEditor />} />
          {/* Artisans : annuaire + interventions en onglets */}
          <Route path="artisans" element={<ArtisansLayout />}>
            <Route index element={<ArtisansDirectory />} />
            <Route path="interventions" element={<WorkOrdersList />} />
          </Route>
          <Route path="artisans/interventions/:id" element={<WorkOrderDetail />} />
          {/* Gestion locative : mandats + baux + candidatures en onglets */}
          <Route path="gestion-locative" element={<RentalLayout />}>
            <Route index element={<MandatesList />} />
            <Route path="baux" element={<LeasesList />} />
            <Route path="candidatures" element={<ApplicationsList />} />
          </Route>
          <Route path="gestion-locative/mandats/:id" element={<MandateDetail />} />
          <Route path="gestion-locative/baux/:id" element={<LeaseDetail />} />
          <Route path="gestion-locative/candidatures/:id" element={<ApplicationDetail />} />
          <Route path="gestion-locative/etats-des-lieux/:invId" element={<InventoryEditor />} />
          <Route path="gestion-locative/decompte/:leaseId" element={<SettlementEditor />} />
          {/* Notaires & juridique : notaires + dossiers en onglets */}
          <Route path="notaires" element={<NotairesLayout />}>
            <Route index element={<NotariesDirectory />} />
            <Route path="dossiers" element={<LegalCasesList />} />
          </Route>
          <Route path="notaires/dossiers/:id" element={<LegalCaseDetail />} />
          {/* Rétro-compatibilité anciennes URLs */}
          <Route path="travaux" element={<Navigate to="/backoffice/artisans/interventions" replace />} />
          <Route path="travaux/:id" element={<Navigate to="/backoffice/artisans/interventions" replace />} />
          <Route path="juridique" element={<Navigate to="/backoffice/notaires/dossiers" replace />} />
          <Route path="juridique/:id" element={<Navigate to="/backoffice/notaires/dossiers" replace />} />
          <Route path="boutique" element={<ShopCatalog />} />
          <Route path="boutique/:id" element={<ProductDetail />} />
          <Route path="panier" element={<Cart />} />
          <Route path="mes-commandes" element={<OrdersList />} />
          <Route path="mes-commandes/:id" element={<OrderDetail />} />
          <Route path="analyses" element={<AnalyticsLayout />}>
            <Route index element={<OverviewAnalytics />} />
            <Route path="finance" element={<FinancialAnalytics />} />
            <Route path="marche" element={<MarketAnalytics />} />
            <Route path="pipeline" element={<PipelineAnalytics />} />
            <Route path="equipe" element={<TeamAnalytics />} />
          </Route>
        </Route>
      </Route>

      {/* Super-admin plateforme (protégé, rôle superadmin) */}
      <Route path="/admin" element={<SuperAdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="comptes" element={<AdminAccounts />} />
          <Route path="comptes/:kind/:id" element={<AdminAccountDetail />} />
          <Route path="activite" element={<AdminOverview />} />
          <Route path="artisans-partages" element={<AdminSharedArtisans />} />
          <Route path="produits" element={<AdminProducts />} />
          <Route path="commandes" element={<AdminOrders />} />
        </Route>
      </Route>
      </Routes>
    </>
  )
}

export default App
