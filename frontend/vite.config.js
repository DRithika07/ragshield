import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3000,
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

  // ← ADD THIS — tells Vite to replace /api calls with Railway URL in production
  define: {
    __API_BASE__: JSON.stringify(
      process.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
    ),
  },
})