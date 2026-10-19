import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 8789,
    proxy: {
      '/api': 'http://127.0.0.1:8790',
      '/ws': {
        target: 'ws://127.0.0.1:8790',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/client'
  }
});
