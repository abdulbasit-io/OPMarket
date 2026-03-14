import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5174,
    open: false,
    proxy: {
      '/opnet-rpc': {
        target: 'https://testnet.opnet.org',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/opnet-rpc/, ''),
      },
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      stream: 'stream-browserify',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
  },
});
