import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gateway } from './proxy.mjs';
import { approval } from './approval.mjs';
import { embedPreviews } from './embeds.mjs';
import { imageUploads } from './uploads.mjs';
import { gifSearch } from './gifs.mjs';
try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const middleware = gateway(process.env);
const accountMiddleware = approval(process.env);
const previewMiddleware = embedPreviews();
const uploadMiddleware = imageUploads(process.env);
const gifMiddleware = gifSearch();
const certPath=process.env.FREECAST_TLS_CERT,keyPath=process.env.FREECAST_TLS_KEY;
if(Boolean(certPath)!==Boolean(keyPath))throw new Error('Configure both FREECAST_TLS_CERT and FREECAST_TLS_KEY for HTTPS.');
const tls=certPath?{cert:await readFile(certPath),key:await readFile(keyPath)}:undefined;
const createListener=tls?handler=>createHttpsServer(tls,handler):createServer;
const server = createListener((req, res) => gifMiddleware(req,res,() => uploadMiddleware(req,res,() => accountMiddleware(req,res,() => previewMiddleware(req,res,() => middleware(req, res, async () => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) { res.statusCode = 404; res.end('Unknown endpoint'); return; }
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) { res.statusCode = 403; res.end(); return; }
    if (!extname(file)) file = resolve(root, 'index.html');
    const content = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(content);
  } catch { res.statusCode = 404; res.end('Not found'); }
}))))));
const host=process.env.FREECAST_HOST||'127.0.0.1',port=Number(process.env.PORT||5173);
server.listen(port,host,()=>console.log(`Freecast ${tls?'HTTPS':'HTTP'} listener ready on port ${port}`));
