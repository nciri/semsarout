import { Routes, Route, Navigate } from 'react-router-dom'
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

// Backoffice imports
import BackofficeLayout from './pages/backoffice/components/BackofficeLayout'
import BackofficeDashboard from './pages/backoffice/Dashboard'
import BackofficeProperties from './pages/backoffice/Properties'
import BackofficePropertyForm from './pages/backoffice/PropertyForm'
import BackofficeClients from './pages/backoffice/Clients'
import BackofficeClientForm from './pages/backoffice/ClientForm'
import BackofficeLeads from './pages/backoffice/Leads'
import BackofficeVisits from './pages/backoffice/Visits'
import BackofficePipeline from './pages/backoffice/Pipeline'
import BackofficeTransactions from './pages/backoffice/Transactions'
import BackofficeTeam from './pages/backoffice/Team'
import BackofficeStats from './pages/backoffice/Statistics'
import BackofficeSettings from './pages/backoffice/Settings'
import BackofficeStripeConfig from './pages/backoffice/StripeConfig'
import ContractsList from './pages/backoffice/contracts/ContractsList'
import ContractCreate from './pages/backoffice/contracts/ContractCreate'
import ContractEditor from './pages/backoffice/contracts/ContractEditor'
import TemplatesManager from './pages/backoffice/contracts/TemplatesManager'
import NotariesDirectory from './pages/backoffice/legal/NotariesDirectory'
import ArtisansDirectory from './pages/backoffice/artisans/ArtisansDirectory'
import WorkOrdersList from './pages/backoffice/artisans/WorkOrdersList'
import WorkOrderDetail from './pages/backoffice/artisans/WorkOrderDetail'
import LegalCasesList from './pages/backoffice/legal/LegalCasesList'
import LegalCaseDetail from './pages/backoffice/legal/LegalCaseDetail'
import AnalyticsLayout from './pages/backoffice/analytics/AnalyticsLayout'
import FinancialAnalytics from './pages/backoffice/analytics/FinancialAnalytics'
import MarketAnalytics from './pages/backoffice/analytics/MarketAnalytics'
import PipelineAnalytics from './pages/backoffice/analytics/PipelineAnalytics'
import TeamAnalytics from './pages/backoffice/analytics/TeamAnalytics'
import Subscription from './pages/dashboard/Subscription'
import DashboardSettings from './pages/dashboard/Settings'
import ImpersonationBanner from './components/admin/ImpersonationBanner'

function App() {
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

          {/* Mon compte : agence / abonnement / paramètres regroupés en onglets */}
          <Route path="compte" element={<AccountTabs />}>
            <Route index element={<Navigate to="agence" replace />} />
            <Route path="agence" element={<MyAgency />} />
            <Route path="abonnement" element={<Subscription />} />
            <Route path="parametres" element={<DashboardSettings />} />
          </Route>
          {/* Anciennes URLs -> nouvelles (rétro-compatibilité) */}
          <Route path="agence" element={<Navigate to="/dashboard/compte/agence" replace />} />
          <Route path="abonnement" element={<Navigate to="/dashboard/compte/abonnement" replace />} />
          <Route path="parametres" element={<Navigate to="/dashboard/compte/parametres" replace />} />

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
          <Route path="clients/:id" element={<BackofficeClientForm />} />
          <Route path="leads" element={<BackofficeLeads />} />
          <Route path="visites" element={<BackofficeVisits />} />
          <Route path="visites/nouvelle" element={<BackofficeVisits />} />
          <Route path="pipeline" element={<BackofficePipeline />} />
          <Route path="transactions" element={<BackofficeTransactions />} />
          <Route path="transactions/:id" element={<BackofficeTransactions />} />
          <Route path="equipe" element={<BackofficeTeam />} />
          <Route path="statistiques" element={<BackofficeStats />} />
          <Route path="parametres" element={<BackofficeSettings />} />
          <Route path="stripe" element={<BackofficeStripeConfig />} />
          <Route path="contrats" element={<ContractsList />} />
          <Route path="contrats/nouveau" element={<ContractCreate />} />
          <Route path="contrats/modeles" element={<TemplatesManager />} />
          <Route path="contrats/:id" element={<ContractEditor />} />
          <Route path="notaires" element={<NotariesDirectory />} />
          <Route path="artisans" element={<ArtisansDirectory />} />
          <Route path="travaux" element={<WorkOrdersList />} />
          <Route path="travaux/:id" element={<WorkOrderDetail />} />
          <Route path="juridique" element={<LegalCasesList />} />
          <Route path="juridique/:id" element={<LegalCaseDetail />} />
          <Route path="analyses" element={<AnalyticsLayout />}>
            <Route index element={<FinancialAnalytics />} />
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
        </Route>
      </Route>
      </Routes>
    </>
  )
}

export default App
