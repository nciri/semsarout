import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5600,
    proxy: {
      '/api': {
        target: 'http://localhost:7000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:7000',
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
