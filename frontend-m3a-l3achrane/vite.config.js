import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5610,
    proxy: {
      // Dev : le BFF résout le tenant via cet en-tête (en prod : par Host/Traefik).
      '/api': {
        target: 'http://localhost:8099',
        changeOrigin: true,
        headers: { 'x-tenant': 'm3a-l3achrane' },
      },
      '/uploads': {
        target: 'http://localhost:8099',
        changeOrigin: true,
        headers: { 'x-tenant': 'm3a-l3achrane' },
      },
    },
  },
  resolve: { alias: { '@': '/src' } },
})
