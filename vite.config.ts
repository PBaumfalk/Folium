import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:18081', '/fonts': 'http://localhost:18081' },
  },
});
