import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import App from './App'
import AppToastContainer from './components/common/AppToastContainer'
import './i18n'
import './assets/styles/index.css'
import 'react-toastify/dist/ReactToastify.css'

// Le service worker est genere en `autoUpdate` : skipWaiting + clientsClaim +
// cleanupOutdatedCaches. Un deploiement pendant qu'un agent travaille prend donc
// le controle immediatement ET purge les fragments haches que l'onglet ouvert —
// qui execute toujours l'ancien index-*.js — reclamera a la navigation suivante.
// Sans ce rechargement, la page suivante echoue a se charger. Le drapeau evite
// toute boucle : apres le reload, le nouveau worker controle deja la page.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <App />
        <AppToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
