import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Shared JavaScript middleware runs in Node, not the client.
import { gateway } from './proxy.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: 'freecast-gateway', configureServer(server) {
    server.middlewares.use(gateway({ ...loadEnv(mode, process.cwd(), ''), ...process.env }));
  } }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
