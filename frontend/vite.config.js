import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
