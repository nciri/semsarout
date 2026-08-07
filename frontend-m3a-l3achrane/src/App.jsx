import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SurfaceSwitcher from './surfaces/SurfaceSwitcher.jsx'

const WebLayout = lazy(() => import('./surfaces/web/WebLayout.jsx'))
const Landing = lazy(() => import('./surfaces/web/Landing.jsx'))
const SearchResults = lazy(() => import('./surfaces/web/SearchResults.jsx'))
const ListingDetail = lazy(() => import('./surfaces/web/ListingDetail.jsx'))
const Connexion = lazy(() => import('./surfaces/web/Connexion.jsx'))
const Inscription = lazy(() => import('./surfaces/web/Inscription.jsx'))
const Avis = lazy(() => import('./surfaces/web/Avis.jsx'))
const AppLayout = lazy(() => import('./surfaces/app/AppLayout.jsx'))
const Dashboard = lazy(() => import('./surfaces/app/Dashboard.jsx'))
const Messaging = lazy(() => import('./surfaces/app/Messaging.jsx'))
const Candidature = lazy(() => import('./surfaces/app/Candidature.jsx'))
const Candidatures = lazy(() => import('./surfaces/app/Candidatures.jsx'))
const ValidationColocataire = lazy(() => import('./surfaces/app/ValidationColocataire.jsx'))
const Questionnaire = lazy(() => import('./surfaces/app/Questionnaire.jsx'))
const Paiement = lazy(() => import('./surfaces/app/Paiement.jsx'))
const Securite = lazy(() => import('./surfaces/app/Securite.jsx'))
const PartnerLayout = lazy(() => import('./surfaces/partner/PartnerLayout.jsx'))
const PartnerPortal = lazy(() => import('./surfaces/partner/PartnerPortal.jsx'))
const BackOffice = lazy(() => import('./surfaces/backoffice/BackOffice.jsx'))
const AttributionChambres = lazy(() => import('./surfaces/backoffice/AttributionChambres.jsx'))
const NotFound = lazy(() => import('./surfaces/NotFound.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ padding: 48 }}>Chargement…</div>}>
        <Routes>
          <Route element={<WebLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/recherche" element={<SearchResults />} />
            <Route path="/annonce/:id" element={<ListingDetail />} />
            <Route path="/connexion" element={<Connexion />} />
            <Route path="/inscription" element={<Inscription />} />
            <Route path="/avis" element={<Avis />} />
          </Route>
          <Route path="/espace" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="messages" element={<Messaging />} />
            <Route path="candidatures" element={<Candidatures />} />
            <Route path="validation" element={<ValidationColocataire />} />
            <Route path="candidature" element={<Candidature />} />
            <Route path="questionnaire" element={<Questionnaire />} />
            <Route path="paiement" element={<Paiement />} />
            <Route path="securite" element={<Securite />} />
          </Route>
          <Route path="/partenaire" element={<PartnerLayout />}>
            <Route index element={<PartnerPortal />} />
          </Route>
          <Route path="/back-office" element={<BackOffice />} />
          <Route path="/back-office/attribution" element={<AttributionChambres />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SurfaceSwitcher />
    </BrowserRouter>
  )
}
