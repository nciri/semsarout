import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SurfaceSwitcher from './surfaces/SurfaceSwitcher.jsx'

const WebLayout = lazy(() => import('./surfaces/web/WebLayout.jsx'))
const Landing = lazy(() => import('./surfaces/web/Landing.jsx'))
const SearchResults = lazy(() => import('./surfaces/web/SearchResults.jsx'))
const ListingDetail = lazy(() => import('./surfaces/web/ListingDetail.jsx'))
const AppLayout = lazy(() => import('./surfaces/app/AppLayout.jsx'))
const Dashboard = lazy(() => import('./surfaces/app/Dashboard.jsx'))
const Messaging = lazy(() => import('./surfaces/app/Messaging.jsx'))
const PartnerLayout = lazy(() => import('./surfaces/partner/PartnerLayout.jsx'))
const PartnerPortal = lazy(() => import('./surfaces/partner/PartnerPortal.jsx'))
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
          </Route>
          <Route path="/espace" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="messages" element={<Messaging />} />
          </Route>
          <Route path="/partenaire" element={<PartnerLayout />}>
            <Route index element={<PartnerPortal />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SurfaceSwitcher />
    </BrowserRouter>
  )
}
