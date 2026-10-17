import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Shared JavaScript middleware runs in Node, not the client.
import { gateway } from './proxy.mjs';
// @ts-expect-error Server-only middleware is shared with the Node production server.
import { approval } from './approval.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react(), { name: 'freecast-gateway', configureServer(server) {
    const config = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
    server.middlewares.use(approval(config));
    server.middlewares.use(gateway(config));
  } }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
