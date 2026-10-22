import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {staticFiles} from './static.mjs';
import { gateway } from './proxy.mjs';
import { approval } from './approval.mjs';
import { embedPreviews } from './embeds.mjs';
import { imageUploads } from './uploads.mjs';
import { gifSearch } from './gifs.mjs';
import { indexedFeed } from './feed/api.mjs';
try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const root = resolve('dist');
const serve=staticFiles(root,process.env);
const middleware = gateway(process.env);
const feedMiddleware = indexedFeed(process.env);
const accountMiddleware = approval(process.env,{enrollFeed:feedMiddleware.enroll});
const previewMiddleware = embedPreviews();
const uploadMiddleware = imageUploads(process.env);
const gifMiddleware = gifSearch();
const certPath=process.env.KITE_TLS_CERT,keyPath=process.env.KITE_TLS_KEY;
if(Boolean(certPath)!==Boolean(keyPath))throw new Error('Configure both KITE_TLS_CERT and KITE_TLS_KEY for HTTPS.');
const tls=certPath?{cert:await readFile(certPath),key:await readFile(keyPath)}:undefined;
const createListener=tls?handler=>createHttpsServer(tls,handler):createServer;
const server = createListener((req, res) => feedMiddleware(req,res,() => gifMiddleware(req,res,() => uploadMiddleware(req,res,() => accountMiddleware(req,res,() => previewMiddleware(req,res,() => middleware(req, res, async () => {
  await serve(req,res);
})))))));
const host=process.env.KITE_HOST||'127.0.0.1',port=Number(process.env.PORT||5173);
server.listen(port,host,()=>console.log(`Kite ${tls?'HTTPS':'HTTP'} listener ready on port ${port}`));
