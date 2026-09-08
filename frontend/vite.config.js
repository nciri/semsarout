import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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
            // NetworkFirst : le réseau fait foi, le cache n'est qu'un filet
            // hors-ligne. Workbox ne met en cache que les GET : les écritures
            // design3d (POST/PUT/DELETE) ne sont donc jamais servies depuis le
            // cache — elles échouent et repartent par la file d'attente.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5 },
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
