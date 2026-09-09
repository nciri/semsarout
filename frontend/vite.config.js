import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// Source unique du périmètre et du nom du cache d'exécution : le cache déclaré
// ici doit porter le nom que `authStore.logout()` supprime, et ne couvrir que
// les routes que le test `runtimeCache.test.js` autorise.
import { API_RUNTIME_CACHE, matchDesign3dRead } from './src/utils/runtimeCache.js'

export default defineConfig({
  plugins: [
    react(),
    // Application installable — l'éditeur de plan (design3d) doit rester
    // utilisable sur tablette une fois le Wi-Fi coupé. Le service worker ne
    // sert QUE de repli réseau : la persistance des plans, elle, est assurée
    // par IndexedDB + la file d'attente (services/design3dLocal, design3dSync).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SemsarOut',
        short_name: 'SemsarOut',
        description: "Portail immobilier du Maroc — annonces, gestion et éditeur de plan hors-ligne.",
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        lang: 'fr',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Le bundle applicatif dépasse la limite Workbox de 2 Mio ; sans ce
        // relèvement il ne serait PAS pré-caché et l'application ne
        // démarrerait pas hors ligne — ce qui viderait la PWA de son intérêt
        // pour l'éditeur de plan. À redescendre le jour où le bundle est
        // découpé (code splitting).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Une navigation vers l'API ou un média ne doit jamais recevoir la
        // coquille HTML : sans cette liste, un GET /api/... hors ligne
        // renverrait du HTML là où le client attend du JSON.
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            // Portée VOLONTAIREMENT étroite : seules les LECTURES de plans
            // design3d sont mises en cache. Un `/api/` global mettrait en
            // cache toutes les réponses authentifiées de l'application (leads,
            // données de compte…) : sur une tablette partagée, elles
            // resteraient lisibles par l'agent suivant, et un NetworkFirst y
            // retomberait dès que le réseau est lent. La spec ne demande
            // l'hors-ligne que pour design3d.
            //
            // `method: 'GET'` est explicite (c'est déjà le défaut Workbox) :
            // les écritures design3d ne sont donc jamais servies depuis le
            // cache — elles échouent hors ligne et repartent par la file
            // d'attente IndexedDB.
            urlPattern: matchDesign3dRead,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: API_RUNTIME_CACHE,
              networkTimeoutSeconds: 5,
              // Borné dans le temps et en volume : un plan ne doit pas rester
              // consultable indéfiniment après une déconnexion oubliée.
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5600,
    proxy: {
      '/api': {
        // BFF/gateway v2 : route catalog + directory vers les microservices,
        // tout le reste retombe sur le monolithe (:7000). Voir docs/architecture-v2-bringup.md.
        target: 'http://localhost:8099',
        changeOrigin: true
      },
      '/uploads': {
        // Médias servis par le BFF (→ listing / stockage objet), plus le disque du monolithe.
        target: 'http://localhost:8099',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
