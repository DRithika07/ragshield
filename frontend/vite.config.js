import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Clean imports: import X from '@/components/...' instead of '../../components/...'
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3000,
    // Proxy all /api calls to the FastAPI backend during development.
    // No CORS issues — Vite forwards requests transparently.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    // Split large vendor chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          motion:   ['framer-motion'],
          charts:   ['recharts'],
          ui:       ['lucide-react', 'clsx'],
        },
      },
    },
  },
})
