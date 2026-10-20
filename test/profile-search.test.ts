import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfileSearch, resolveProfileSearch } from '../src/lib/profile-search';
import type { Config } from '../src/lib/hub';

const config: Config = { readUrl: '/api/read', optimismRpcUrl: '', useGateway: true };

test('profile search accepts exact usernames, FIDs and current or legacy profile URLs', () => {
  for (const input of [' @BALAJIS.eth ', 'balajis.eth', 'https://farcaster.xyz/balajis.eth', 'https://www.warpcast.com/balajis.eth/?ref=share']) {
    assert.deepEqual(parseProfileSearch(input), { username: 'balajis.eth' });
  }
  for (const input of ['37', ' 37 ', 'https://farcaster.xyz/37']) assert.deepEqual(parseProfileSearch(input), { fid: 37 });
});

test('profile search rejects invalid IDs, foreign URLs, credentials, cast URLs and display names', () => {
  for (const input of ['', '0', '-1', '9007199254740992', 'Balaji Srinivasan', '@', 'https://evil.example/balajis.eth', 'https://farcaster.xyz.evil.example/u', 'https://user@farcaster.xyz/u', 'https://farcaster.xyz:8443/u', 'https://farcaster.xyz/u/0x50184b62', 'javascript:alert(1)']) {
    assert.throws(() => parseProfileSearch(input), /exact username/);
  }
});

test('username searches resolve through the read node and numeric FIDs need no request', async () => {
  const original = globalThis.fetch, controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input), 'https://client.example');
    assert.equal(url.pathname, '/api/read/v1/userNameProofByName');
    assert.equal(url.searchParams.get('name'), 'balajis.eth');
    assert.equal(init?.signal, controller.signal);
    return Response.json({ fid: 37 });
  };
  try {
    assert.equal(await resolveProfileSearch(config, '@Balajis.eth', controller.signal), 37);
    assert.equal(await resolveProfileSearch(config, 'https://warpcast.com/balajis.eth', controller.signal), 37);
    assert.equal(await resolveProfileSearch(config, '37'), 37);
    assert.equal(calls, 2);
    await assert.rejects(resolveProfileSearch(config, 'https://evil.example/u'), /exact username/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('missing profiles explain the exact username and FID fallback', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('missing', { status: 404 });
    await assert.rejects(resolveProfileSearch(config, 'missing'), /Check the exact username or try their FID/);
    for (const fid of [0, -1, '37', null]) {
      globalThis.fetch = async () => Response.json({ fid });
      await assert.rejects(resolveProfileSearch(config, 'missing'), /No profile found/);
    }
  } finally { globalThis.fetch = original; }
});

test('cancelled profile searches preserve cancellation', async () => {
  const original = globalThis.fetch, controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_input, init) => { throw init?.signal?.reason; };
  try { await assert.rejects(resolveProfileSearch(config, 'balajis.eth', controller.signal), { name: 'AbortError' }); }
  finally { globalThis.fetch = original; }
});
