import {hubUrl} from './node-config.mjs';
import { feedFids } from './feed/api.mjs';
import { joinedDates } from './joined.mjs';
import { profileCounts } from './profile-counts.mjs';
// One same-origin gateway for local development and the production Node server.
// URLs come from operator configuration, never from request input.
const readPaths = new Set(['info', 'castsByFid', 'castById', 'castsByParent', 'castsByMention', 'userDataByFid', 'verificationsByFid', 'linksByFid', 'linkById', 'linksByTargetFid', 'reactionsByFid', 'reactionsByCast', 'storageLimitsByFid', 'onChainSignersByFid', 'signersByFid', 'onChainIdRegistryEventByAddress', 'userNameProofByName']);
import {writeOrigin} from './origin.mjs';
export {writeOrigin} from './origin.mjs';
export function gateway(config) {
  const joinedMiddleware=joinedDates();
  const countsMiddleware=profileCounts();
  const nodeUrl = hubUrl(config);
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if(url.pathname==='/api/profile/joined')return joinedMiddleware(req,res,next);
    if(url.pathname==='/api/profile/counts')return countsMiddleware(req,res,next);
    if (url.pathname === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ indexedFeedEnabled:Boolean(config.DATABASE_URL),indexedFeedFids:config.DATABASE_URL?feedFids(config):[],defaultFeedFid:config.DATABASE_URL?feedFids(config)[0]:undefined,readUrl: '/api/read', optimismRpcUrl: config.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io', approvalConfigured: Boolean(config.FARCASTER_APP_ENV_FILE || (config.FARCASTER_APP_FID && config.FARCASTER_APP_MNEMONIC)) })); return;
    }
    const read = url.pathname.startsWith('/api/read/v1/');
    const write = url.pathname === '/api/write/v1/submitMessage';
    if (!read && !write) return next();
    if ((read && (req.method !== 'GET' || !readPaths.has(url.pathname.split('/').pop()))) || (write && req.method !== 'POST')) { res.statusCode = 405; res.end('Method or endpoint not allowed'); return; }
    if (write) {
      let expected;
      try { expected=writeOrigin(req,config); } catch { res.statusCode=403;res.end('Invalid request origin');return; }
      if (expected.host!==req.headers.host || (req.headers.origin && req.headers.origin!==expected.origin)) { res.statusCode = 403; res.end('Origin mismatch. Open the app at its configured origin, or set KITE_PUBLIC_URL to the exact browser origin and restart.'); return; }
    }
    try {
      const target = new URL(url.pathname.replace(/^\/api\/(read|write)/, '') + url.search, nodeUrl);
      const chunks = []; let size = 0;
      if (write) for await (const chunk of req) { size += chunk.length; if (size > 100_000) { res.statusCode = 413; res.end('Message too large'); return; } chunks.push(chunk); }
      const response = await fetch(target, { method: req.method, headers: write ? { 'Content-Type': 'application/octet-stream' } : {}, body: write ? Buffer.concat(chunks) : undefined, signal: AbortSignal.timeout(25_000), redirect: 'error' });
      res.statusCode = response.status;
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message || 'Upstream unavailable' })); }
  };
}
