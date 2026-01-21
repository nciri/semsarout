import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import PropertyList from './pages/PropertyList'
import PropertyDetail from './pages/PropertyDetail'
import AgencyList from './pages/AgencyList'
import AgencyDetail from './pages/AgencyDetail'
import AgencyPricing from './pages/AgencyPricing'
import Services from './pages/Services'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/dashboard/Dashboard'
import MyProperties from './pages/dashboard/MyProperties'
import CreateProperty from './pages/dashboard/CreateProperty'
import MyLeads from './pages/dashboard/MyLeads'
import MyAgency from './pages/dashboard/MyAgency'
import Checkout from './pages/Checkout'
import NotFound from './pages/NotFound'
import PrivateRoute from './components/auth/PrivateRoute'

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
import Subscription from './pages/dashboard/Subscription'
import DashboardSettings from './pages/dashboard/Settings'

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="annonces" element={<PropertyList />} />
        <Route path="annonces/:id" element={<PropertyDetail />} />
        <Route path="agences" element={<AgencyList />} />
        <Route path="agences/tarifs" element={<AgencyPricing />} />
        <Route path="agences/:slug" element={<AgencyDetail />} />
        <Route path="nos-services" element={<Services />} />
        <Route path="nos-services/:service" element={<Services />} />
        <Route path="connexion" element={<Login />} />
        <Route path="inscription" element={<Register />} />

        {/* Protected routes */}
        <Route path="dashboard" element={<PrivateRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="annonces" element={<MyProperties />} />
          <Route path="annonces/nouvelle" element={<CreateProperty />} />
          <Route path="leads" element={<MyLeads />} />
          <Route path="agence" element={<MyAgency />} />
          <Route path="abonnement" element={<Subscription />} />
          <Route path="parametres" element={<DashboardSettings />} />
        </Route>

        {/* Checkout (protected) */}
        <Route path="checkout" element={<PrivateRoute />}>
          <Route index element={<Checkout />} />
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
        </Route>
      </Route>
    </Routes>
  )
}

export default App
