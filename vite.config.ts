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

// @ts-expect-error Server-only indexed feed middleware.
import { indexedFeed } from './feed/api.mjs';
// @ts-expect-error Shared server-side social preview metadata.
import {renderPageMetadata} from './page-metadata.mjs';

export default defineConfig(({mode})=>{
  const config={...loadEnv(mode,process.cwd(),''),...process.env};
  const savedSigners=normalizePath(resolve(config.KITE_SESSION_DIR||'.kite/sessions'));
  return {
    plugins:[react(),{name:'kite-page-metadata',transformIndexHtml(html,context){
      return renderPageMetadata(html,new URL(context.originalUrl||context.path,'http://localhost').pathname,config.KITE_PUBLIC_URL||'');
    }},{name:'kite-gateway',configureServer(server){
      const feedMiddleware=indexedFeed(config);
      server.middlewares.use(feedMiddleware);
      server.middlewares.use(gifSearch());
      server.middlewares.use(imageUploads(config));
      server.middlewares.use(approval(config,{enrollFeed:feedMiddleware.enroll}));
      server.middlewares.use(embedPreviews());
      server.middlewares.use(gateway(config));
    }}],
    server:{host:'127.0.0.1',port:5173,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.kite/**',`${savedSigners}/**`]}},
  };
});
