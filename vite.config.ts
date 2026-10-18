import {resolve} from 'node:path';
import { defineConfig, loadEnv, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Shared JavaScript middleware runs in Node, not the client.
import { gateway } from './proxy.mjs';
// @ts-expect-error Server-only middleware is shared with the Node production server.
import { approval } from './approval.mjs';
// @ts-expect-error Server-only metadata fetcher is shared with production.
import { embedPreviews } from './embeds.mjs';

// @ts-expect-error Server-only image upload middleware.
import { imageUploads } from './uploads.mjs';

// @ts-expect-error Server-only GIF search middleware.
import { gifSearch } from './gifs.mjs';

export default defineConfig(({mode})=>{
  const config={...loadEnv(mode,process.cwd(),''),...process.env};
  const savedSigners=normalizePath(resolve(config.FREECAST_SESSION_DIR||'.freecast/sessions'));
  return {
    plugins:[react(),{name:'freecast-gateway',configureServer(server){
      server.middlewares.use(gifSearch());
      server.middlewares.use(imageUploads(config));
      server.middlewares.use(approval(config));
      server.middlewares.use(embedPreviews());
      server.middlewares.use(gateway(config));
    }}],
    server:{host:'127.0.0.1',port:5173,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.freecast/**',`${savedSigners}/**`]}},
  };
});
