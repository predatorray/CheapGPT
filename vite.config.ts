import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  worker: { format: 'es' },
  // Prebundle worker-only dependencies before a chat can trigger an optimizer reload.
  optimizeDeps: {
    include: [
      'quickjs-emscripten-core',
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-release-sync/ffi',
      '@jitl/quickjs-wasmfile-release-sync/emscripten-module',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ['react-markdown', 'remark-gfm'],
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
});
