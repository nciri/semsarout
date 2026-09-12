import { Suspense, lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { applyDirection } from './i18n/rtl'
import Layout from './components/layout/Layout'
import PrivateRoute from './components/auth/PrivateRoute'
import SuperAdminRoute from './components/auth/SuperAdminRoute'
import ImpersonationBanner from './components/admin/ImpersonationBanner'
import RouteErrorBoundary from './components/common/RouteErrorBoundary'
import { RouteFallback } from './components/common/RouteOutlet'

// Chaque page est chargee a la demande (code splitting) : sans cela tout le
// portail, le backoffice, l'administration et leurs dependances lourdes
// (leaflet, recharts, quill, jspdf) partent dans un unique bundle de plusieurs
// Mio, que le service worker de la PWA ne peut pre-cacher qu'en relevant sa
// limite. Seuls les elements presents sur tout ecran restent statiques :
// la coquille, les gardes de route et le bandeau d'usurpation.

const Home = lazy(() => import('./pages/Home'))
const PropertyList = lazy(() => import('./pages/PropertyList'))
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'))
const AgencyList = lazy(() => import('./pages/AgencyList'))
const AgencyDetail = lazy(() => import('./pages/AgencyDetail'))
const AgencyPricing = lazy(() => import('./pages/AgencyPricing'))
const Services = lazy(() => import('./pages/Services'))
const Contact = lazy(() => import('./pages/Contact'))
const SellProperty = lazy(() => import('./pages/SellProperty'))
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const AcceptInvitation = lazy(() => import('./pages/auth/AcceptInvitation'))
const About = lazy(() => import('./pages/About'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const CheckoutConfirmation = lazy(() => import('./pages/CheckoutConfirmation'))
const PaymentGateway = lazy(() => import('./pages/PaymentGateway'))
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))
const MyProperties = lazy(() => import('./pages/dashboard/MyProperties'))
const CreateProperty = lazy(() => import('./pages/dashboard/CreateProperty'))
const MyLeads = lazy(() => import('./pages/dashboard/MyLeads'))
const MyApplications = lazy(() => import('./pages/dashboard/MyApplications'))
const MyApplicationDetail = lazy(() => import('./pages/dashboard/MyApplicationDetail'))
const MyAgency = lazy(() => import('./pages/dashboard/MyAgency'))
const Checkout = lazy(() => import('./pages/Checkout'))
const NotFound = lazy(() => import('./pages/NotFound'))
const ProgramList = lazy(() => import('./pages/ProgramList'))
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'))
const DashboardPrograms = lazy(() => import('./pages/dashboard/Programs'))
const DashboardProgramForm = lazy(() => import('./pages/dashboard/ProgramForm'))
const ProgramPlanEditor = lazy(() => import('./pages/dashboard/ProgramPlanEditor'))
const MarketPrices = lazy(() => import('./pages/dashboard/MarketPrices'))
const DesignProjects = lazy(() => import('./pages/dashboard/DesignProjects'))
const DesignEditor = lazy(() => import('./pages/dashboard/DesignEditor'))
const StayManagerTabs = lazy(() => import('./pages/dashboard/integrations/StayManagerTabs'))
const StayManagerIntegration = lazy(() => import('./pages/dashboard/integrations/StayManager'))
const StayManagerProperties = lazy(() => import('./pages/dashboard/integrations/StayManagerProperties'))
const StayManagerReservations = lazy(() => import('./pages/dashboard/integrations/StayManagerReservations'))
const AccountTabs = lazy(() => import('./pages/dashboard/AccountTabs'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'))
const AdminAccounts = lazy(() => import('./pages/admin/AdminAccounts'))
const AdminAccountDetail = lazy(() => import('./pages/admin/AdminAccountDetail'))
const AdminSharedArtisans = lazy(() => import('./pages/admin/AdminSharedArtisans'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const SavedSearches = lazy(() => import('./pages/dashboard/SavedSearches'))
const BuyerMessages = lazy(() => import('./pages/dashboard/BuyerMessages'))
const AgencyMessages = lazy(() => import('./pages/dashboard/AgencyMessages'))
const Availability = lazy(() => import('./pages/dashboard/Availability'))
const MortgageSimulator = lazy(() => import('./pages/MortgageSimulator'))
const CompareProperties = lazy(() => import('./pages/CompareProperties'))
const BackofficeLayout = lazy(() => import('./pages/backoffice/components/BackofficeLayout'))
const BackofficeDashboard = lazy(() => import('./pages/backoffice/Dashboard'))
const BackofficeProperties = lazy(() => import('./pages/backoffice/Properties'))
const BackofficePropertyForm = lazy(() => import('./pages/backoffice/PropertyForm'))
const BackofficeClients = lazy(() => import('./pages/backoffice/Clients'))
const BackofficeClientForm = lazy(() => import('./pages/backoffice/ClientForm'))
const BackofficeClientDetail = lazy(() => import('./pages/backoffice/ClientDetail'))
const BackofficeLeads = lazy(() => import('./pages/backoffice/Leads'))
const BackofficeVisits = lazy(() => import('./pages/backoffice/Visits'))
const BackofficePipeline = lazy(() => import('./pages/backoffice/Pipeline'))
const BackofficeTransactions = lazy(() => import('./pages/backoffice/Transactions'))
const TransactionCreate = lazy(() => import('./pages/backoffice/TransactionCreate'))
const BackofficeTransactionDetail = lazy(() => import('./pages/backoffice/TransactionDetail'))
const BackofficeTeam = lazy(() => import('./pages/backoffice/Team'))
const OverviewAnalytics = lazy(() => import('./pages/backoffice/analytics/OverviewAnalytics'))
const SettingsHub = lazy(() => import('./pages/backoffice/SettingsHub'))
const BackofficeStripeConfig = lazy(() => import('./pages/backoffice/StripeConfig'))
const ContractsList = lazy(() => import('./pages/backoffice/contracts/ContractsList'))
const ContractCreate = lazy(() => import('./pages/backoffice/contracts/ContractCreate'))
const ContractEditor = lazy(() => import('./pages/backoffice/contracts/ContractEditor'))
const TemplatesManager = lazy(() => import('./pages/backoffice/contracts/TemplatesManager'))
const NotariesDirectory = lazy(() => import('./pages/backoffice/legal/NotariesDirectory'))
const NotairesLayout = lazy(() => import('./pages/backoffice/legal/NotairesLayout'))
const ArtisansLayout = lazy(() => import('./pages/backoffice/artisans/ArtisansLayout'))
const ArtisansDirectory = lazy(() => import('./pages/backoffice/artisans/ArtisansDirectory'))
const WorkOrdersList = lazy(() => import('./pages/backoffice/artisans/WorkOrdersList'))
const WorkOrderDetail = lazy(() => import('./pages/backoffice/artisans/WorkOrderDetail'))
const RentalLayout = lazy(() => import('./pages/backoffice/rental/RentalLayout'))
const MandatesList = lazy(() => import('./pages/backoffice/rental/MandatesList'))
const MandateDetail = lazy(() => import('./pages/backoffice/rental/MandateDetail'))
const LeasesList = lazy(() => import('./pages/backoffice/rental/LeasesList'))
const LeaseDetail = lazy(() => import('./pages/backoffice/rental/LeaseDetail'))
const ApplicationsList = lazy(() => import('./pages/backoffice/rental/ApplicationsList'))
const ApplicationDetail = lazy(() => import('./pages/backoffice/rental/ApplicationDetail'))
const InventoryEditor = lazy(() => import('./pages/backoffice/rental/InventoryEditor'))
const SettlementEditor = lazy(() => import('./pages/backoffice/rental/SettlementEditor'))
const LegalCasesList = lazy(() => import('./pages/backoffice/legal/LegalCasesList'))
const LegalCaseDetail = lazy(() => import('./pages/backoffice/legal/LegalCaseDetail'))
const AnalyticsLayout = lazy(() => import('./pages/backoffice/analytics/AnalyticsLayout'))
const ShopCatalog = lazy(() => import('./pages/backoffice/shop/ShopCatalog'))
const ProductDetail = lazy(() => import('./pages/backoffice/shop/ProductDetail'))
const Cart = lazy(() => import('./pages/backoffice/shop/Cart'))
const OrdersList = lazy(() => import('./pages/backoffice/shop/OrdersList'))
const OrderDetail = lazy(() => import('./pages/backoffice/shop/OrderDetail'))
const FinancialAnalytics = lazy(() => import('./pages/backoffice/analytics/FinancialAnalytics'))
const MarketAnalytics = lazy(() => import('./pages/backoffice/analytics/MarketAnalytics'))
const PipelineAnalytics = lazy(() => import('./pages/backoffice/analytics/PipelineAnalytics'))
const TeamAnalytics = lazy(() => import('./pages/backoffice/analytics/TeamAnalytics'))
const Subscription = lazy(() => import('./pages/dashboard/Subscription'))

function App() {
  const { i18n } = useTranslation()
  const location = useLocation()
  useEffect(() => {
    applyDirection(i18n.language)
    const onChange = (lng) => applyDirection(lng)
    i18n.on('languageChanged', onChange)
    return () => i18n.off('languageChanged', onChange)
  }, [i18n])

  return (
    <>
      <ImpersonationBanner />
      {/* La barriere d'erreur enveloppe le Suspense, jamais l'inverse : le
          Suspense rattrape la SUSPENSION d'un fragment, pas le REJET de son
          import(). Ce Suspense-ci ne sert qu'aux mises en page elles-memes
          (BackofficeLayout, AdminLayout sont paresseuses) ; les pages, elles,
          suspendent sous l'en-tete via RouteOutlet. */}
      <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
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

          {/* Conception 3D : projets d'un bien puis éditeur de plan (hors-ligne d'abord) */}
          <Route path="conception" element={<DesignProjects />} />
          <Route path="conception/:projectId" element={<DesignEditor />} />

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
          <Route path="tarifs" element={<AdminPricing />} />
          <Route path="commandes" element={<AdminOrders />} />
        </Route>
      </Route>
      </Routes>
      </Suspense>
      </RouteErrorBoundary>
    </>
  )
}

export default App
