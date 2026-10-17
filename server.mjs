import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { gateway } from './proxy.mjs';
try { process.loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const middleware = gateway(process.env);
const server = createServer((req, res) => middleware(req, res, async () => {
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
}));
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Freecast: http://127.0.0.1:${process.env.PORT || 5173}`));
