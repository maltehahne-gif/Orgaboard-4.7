/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true }
    }
  },
  test: {
    // jsdom, weil die Tests echte Komponenten rendern statt nur Funktionen
    // aufzurufen. Ein Formatierungsfehler faellt nur dort auf, wo der Text
    // tatsaechlich entsteht.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true
  }
})
