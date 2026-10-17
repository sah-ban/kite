import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY_REGISTRY_ADDRESS, ID_REGISTRY_ADDRESS, NobleEd25519Signer, keyRegistryABI, idRegistryABI } from '@farcaster/core';
import { bytesToHex, decodeFunctionData, encodeFunctionResult } from 'viem';
import { importExistingSigner, unlockSession } from '../src/lib/signing';
import { storedAccount } from '../src/lib/vault';
import type { Config } from '../src/lib/hub';

// Deterministic fixture; this key is never used on a real network.
const privateKey = `0x${'07'.repeat(32)}`;
const fid = 123;
const custody = '0x0000000000000000000000000000000000000001';
const password = 'test fixture passphrase';
const config: Config = {readUrl:'https://read.example',validatorUrl:'',optimismRpcUrl:'https://rpc.example',useGateway:true};

async function withEnvironment(options: { state?: number; units?: number; networkOrigin?: boolean }, run: (requests: string[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const saved = new Map<string,string>();
  const requests: string[] = [];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>saved.get(key) || null,
    setItem:(key:string,value:string)=>{saved.set(key,value);},
    removeItem:(key:string)=>{saved.delete(key);},
  }});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{
    hostname:options.networkOrigin?'192.0.2.10':'127.0.0.1',origin:'http://127.0.0.1:5173',
  }}});
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url + String(init?.body || ''));
    assert.ok(!requests.at(-1)?.includes(privateKey), 'private key must never reach fetch');
    assert.ok(!requests.at(-1)?.includes(password), 'encryption passphrase must never reach fetch');
    if (url.startsWith('/api/read/v1/storageLimitsByFid')) return Response.json({units:options.units ?? 1});
    assert.equal(new URL(url).href,new URL(config.optimismRpcUrl).href);
    const rpc = JSON.parse(String(init?.body));
    assert.equal(rpc.method,'eth_call','import must only read contracts, never broadcast a transaction');
    const call = rpc.params[0];
    let result: string;
    if (call.to.toLowerCase() === KEY_REGISTRY_ADDRESS.toLowerCase()) {
      const decoded = decodeFunctionData({abi:keyRegistryABI,data:call.data});
      assert.equal(decoded.functionName,'keys');
      const requestedFid = (decoded.args as readonly [bigint, string])[0];
      result = encodeFunctionResult({abi:keyRegistryABI,functionName:'keys',result:[requestedFid === BigInt(fid)?options.state ?? 1:0,1]});
    } else {
      assert.equal(call.to.toLowerCase(),ID_REGISTRY_ADDRESS.toLowerCase());
      const decoded = decodeFunctionData({abi:idRegistryABI,data:call.data});
      assert.equal(decoded.functionName,'custodyOf');
      result = encodeFunctionResult({abi:idRegistryABI,functionName:'custodyOf',result:custody});
    }
    return Response.json({jsonrpc:'2.0',id:rpc.id,result});
  };
  try { await run(requests); }
  finally { globalThis.fetch = originalFetch; }
}

test('registered signer import encrypts the key, remains usable, and unlocks without a transaction',async()=>{
  await withEnvironment({},async requests=>{
    const session = await importExistingSigner(config,fid,privateKey,password);
    const expected = await new NobleEd25519Signer(new Uint8Array(32).fill(7)).getSignerKey();
    assert.ok(expected.isOk());
    assert.equal(session.key,bytesToHex(expected.value));
    assert.equal(session.fid,fid);
    assert.equal(session.address,custody);
    const livePublicKey = await session.signer.getSignerKey();
    assert.ok(livePublicKey.isOk());
    assert.equal(bytesToHex(livePublicKey.value),session.key);
    assert.equal(storedAccount()?.key,session.key);
    const encrypted = localStorage.getItem('freecast.app-key.v1')!;
    assert.ok(!encrypted.includes(privateKey.slice(2)));
    assert.ok(!encrypted.includes(password));
    const unlocked = await unlockSession(config,password);
    assert.equal(unlocked.key,session.key);
    assert.equal(requests.length,4);
  });
});

test('unregistered or revoked keys cannot replace the local signer',async()=>{
  for (const state of [0,2]) await withEnvironment({state},async()=>{
    await assert.rejects(importExistingSigner(config,fid,privateKey,password),/not an active onchain signer/);
    assert.equal(storedAccount(),null);
  });
});

test('a signer registered to a different FID cannot be imported',async()=>{
  await withEnvironment({},async()=>{
    await assert.rejects(importExistingSigner(config,999,privateKey,password),/not an active onchain signer/);
    assert.equal(storedAccount(),null);
  });
});

test('a signer without active storage is not persisted',async()=>{
  await withEnvironment({units:0},async()=>{
    await assert.rejects(importExistingSigner(config,fid,privateKey,password),/no active storage/);
    assert.equal(storedAccount(),null);
  });
});

test('invalid key input and network origins are rejected before sending requests',async()=>{
  await withEnvironment({},async requests=>{
    await assert.rejects(importExistingSigner(config,fid,'not-a-key',password),/32-byte Ed25519/);
    await assert.rejects(importExistingSigner(config,0,privateKey,password),/numeric FID/);
    await assert.rejects(importExistingSigner(config,fid,privateKey,'short'),/12 characters/);
    assert.equal(requests.length,0);
  });
  await withEnvironment({networkOrigin:true},async requests=>{
    await assert.rejects(importExistingSigner(config,fid,privateKey,password),/localhost/);
    assert.equal(requests.length,0);
  });
});
