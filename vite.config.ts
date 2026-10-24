import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The YouTube import API runs in server/index.mjs; proxy it so the front end
// can always call same-origin /api/* in dev, preview and production.
const apiProxy = {
  '/api': {
    target: `http://localhost:${process.env.PORT || 4000}`,
    changeOrigin: true,
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
