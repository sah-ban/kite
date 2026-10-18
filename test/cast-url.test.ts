import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCastUrl, resolveCastUrl } from '../src/lib/cast-url';
import type { Config } from '../src/lib/hub';

const config: Config = { readUrl: '/api/read', validatorUrl: '', optimismRpcUrl: '', useGateway: true };
const full = '0x50184b62b4c52fd76628713562e1eda3dccaf63d';

test('parses Farcaster and legacy Warpcast cast links, queries and trailing slashes', () => {
  for (const url of [' https://farcaster.xyz/BALAJIS.eth/0x50184B62 ', 'https://www.warpcast.com/balajis.eth/0x50184b62/?ref=share']) {
    assert.deepEqual(parseCastUrl(url), { author: 'balajis.eth', hash: '0x50184b62' });
  }
  assert.deepEqual(parseCastUrl(`https://farcaster.xyz/37/${full}`), { author: '37', hash: full });
});

test('rejects malformed URLs, foreign hosts, credentials and non-cast paths', () => {
  for (const url of ['hello', 'javascript:alert(1)', 'https://farcaster.xyz.evil.example/u/0x50184b62', 'https://farcaster.xyz@evil.example/u/0x50184b62', 'https://user@farcaster.xyz/u/0x50184b62', 'https://farcaster.xyz:8443/u/0x50184b62', 'https://farcaster.xyz/u', 'https://farcaster.xyz/u/0x123', 'https://farcaster.xyz/~/conversations/0x50184b62']) {
    assert.throws(() => parseCastUrl(url), /Use a Farcaster cast URL/);
  }
});

test('resolves username and paginated short hash, then fetches with full hash and numeric FID', async () => {
  const original = globalThis.fetch, calls: URL[] = [];
  const controller = new AbortController();
  const cast = { hash: full, signer: '0xabc', data: { fid: 37, timestamp: 1, castAddBody: { text: 'hello', mentions: [], mentionsPositions: [], embeds: [] } } };
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.signal, controller.signal);
    const url = new URL(String(input), 'https://client.example'); calls.push(url);
    if (url.pathname.endsWith('/userNameProofByName')) { assert.equal(url.searchParams.get('name'), 'balajis.eth'); return Response.json({ fid: 37 }); }
    assert.equal(url.searchParams.get('fid'), '37');
    if (url.pathname.endsWith('/castsByFid')) return Response.json(url.searchParams.has('pageToken') ? { messages: [cast] } : { messages: [], nextPageToken: 'opaque+/=' });
    assert.equal(url.searchParams.get('hash'), full);
    return Response.json(cast);
  };
  try {
    assert.deepEqual(await resolveCastUrl(config, 'https://farcaster.xyz/balajis.eth/0x50184b62', controller.signal), cast);
    assert.equal(calls.length, 4);
    assert.equal(calls[2].searchParams.get('pageToken'), 'opaque+/=');
    assert.ok(calls.every(url => url.pathname.startsWith('/api/read/v1/')));
  } finally { globalThis.fetch = original; }
});

test('numeric author with full hash goes directly to castById', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input), 'https://client.example');
    assert.equal(url.pathname, '/api/read/v1/castById');
    assert.equal(url.searchParams.get('fid'), '37');
    assert.equal(url.searchParams.get('hash'), full);
    return Response.json({ hash: full });
  };
  try { assert.equal((await resolveCastUrl(config, `https://warpcast.com/37/${full}`)).hash, full); }
  finally { globalThis.fetch = original; }
});

test('missing username proofs and invalid FIDs explain the manual fallback without fetching a cast', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ fid: 0 }); };
  try {
    await assert.rejects(resolveCastUrl(config, 'https://farcaster.xyz/missing/0x50184b62'), /valid author FID/);
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(resolveCastUrl(config, 'https://farcaster.xyz/missing/0x50184b62'), /FID and hash instead/);
  } finally { globalThis.fetch = original; }
});

test('invalid URL makes no network requests', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try { await assert.rejects(resolveCastUrl(config, 'https://other.example/u/0x50184b62'), /Use a Farcaster cast URL/); }
  finally { globalThis.fetch = original; }
});
