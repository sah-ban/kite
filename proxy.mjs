// One same-origin gateway for local development and the production Node server.
// URLs come from operator configuration, never from request input.
const readPaths = new Set(['info', 'castsByFid', 'castById', 'userDataByFid', 'linksByFid', 'reactionsByFid', 'storageLimitsByFid', 'onChainSignersByFid', 'signersByFid', 'onChainIdRegistryEventByAddress']);
export function gateway(config) {
  const readUrl = config.NEXT_PUBLIC_HUBURL || 'http://127.0.0.1:3381';
  const validatorUrl = config.VALIDATOR_URL || '';
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ readUrl, validatorUrl, optimismRpcUrl: config.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' })); return;
    }
    const read = url.pathname.startsWith('/api/read/v1/');
    const write = url.pathname === '/api/write/v1/submitMessage';
    if (!read && !write) return next();
    if ((read && (req.method !== 'GET' || !readPaths.has(url.pathname.split('/').pop()))) || (write && req.method !== 'POST')) { res.statusCode = 405; res.end('Method or endpoint not allowed'); return; }
    if (write && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end('Origin mismatch'); return; }
    if (write && !validatorUrl) { res.statusCode = 503; res.end('Set VALIDATOR_URL to a validator HTTP endpoint before posting.'); return; }
    try {
      const target = new URL(url.pathname.replace(/^\/api\/(read|write)/, '') + url.search, read ? readUrl : validatorUrl);
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
