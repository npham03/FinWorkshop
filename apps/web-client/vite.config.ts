import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/xlsx/')) return 'vendor-spreadsheet';
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id)) return 'vendor-charts';
          if (/\/node_modules\/(react|react-dom|react-router-dom|scheduler)\//.test(id)) return 'vendor-react';
        },
      },
    },
  },
});
