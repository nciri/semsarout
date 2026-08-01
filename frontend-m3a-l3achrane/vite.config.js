import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5610,
    proxy: {
      '/api': { target: 'http://localhost:8099', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8099', changeOrigin: true },
    },
  },
  resolve: { alias: { '@': '/src' } },
})
