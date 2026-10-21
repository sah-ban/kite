import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { NobleEd25519Signer, keyRegistryABI } from '@farcaster/core';
import { bytesToHex, encodeFunctionResult } from 'viem';
import { saveAppKey, unlockAppKey, rememberAppKey, unlockRememberedAppKey, clearRememberedAppKey, forgetAppKey, storedAccount, rememberedAccessCurrent, STORAGE_KEY, REMEMBER_KEY, REMEMBER_DAYS } from '../src/lib/vault';
import { restoreRememberedSession } from '../src/lib/signing';
import { GASLESS_SCOPES } from '../src/lib/gasless';
import type { Config } from '../src/lib/hub';

// Public fixtures only. Every protocol request is mocked and writes are rejected.
const privateKey=new Uint8Array(32).fill(7);
const key=bytesToHex((await new NobleEd25519Signer(privateKey).getSignerKey())._unsafeUnwrap());
const account={fid:123,address:'0x0000000000000000000000000000000000000001' as const,key,registration:'gasless' as const};
const password='remember fixture passphrase';
const config:Config={readUrl:'/api/read',optimismRpcUrl:'https://rpc.example',useGateway:true};
let storage:Map<string,string>;

beforeEach(()=>{
  storage=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(k:string)=>storage.get(k)||null,
    setItem:(k:string,v:string)=>storage.set(k,v),
    removeItem:(k:string)=>storage.delete(k),
  }});
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
  Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{location:{hostname:'localhost'}})});
});

async function records(action?:(store:IDBObjectStore)=>void):Promise<any[]> {
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('kite.device-unlock.v1',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('keys');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('keys',action?'readwrite':'readonly'),store=tx.objectStore('keys');
    action?.(store);const request=store.getAll();
    tx.oncomplete=()=>{db.close();resolve(request.result);};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function remembered(){await saveAppKey(password,privateKey,account);return rememberAppKey(password,account);}

test('remember is opt-in and persists only a non-extractable decrypt key with encrypted signer data',async()=>{
  await saveAppKey(password,privateKey,account);
  assert.equal(await unlockRememberedAppKey(),null);
  assert.equal(storage.get(REMEMBER_KEY),undefined);
  const start=Date.now(),access=await rememberAppKey(password,account);
  assert.ok(access.expiresAt>=start+REMEMBER_DAYS*86400000);
  const [record]=await records();
  assert.equal(record.unlockKey.extractable,false);
  assert.deepEqual(record.unlockKey.usages,['decrypt']);
  await assert.rejects(crypto.subtle.exportKey('raw',record.unlockKey));
  assert.equal(record.vault,storage.get(STORAGE_KEY));
  const persisted=JSON.stringify([...storage])+JSON.stringify(record);
  assert.ok(!persisted.includes(password));
  assert.ok(!persisted.includes('07'.repeat(32)));
  const restored=await unlockRememberedAppKey();
  assert.deepEqual(restored?.privateKey,privateKey);
  assert.deepEqual(restored?.remembered,access);
  restored!.privateKey.fill(0);
});

test('expiry removes remembered access without deleting the passphrase-encrypted vault',async()=>{
  const access=await remembered(),now=Date.now;
  try{
    Date.now=()=>access.expiresAt;
    assert.equal(await unlockRememberedAppKey(),null);
    assert.equal(rememberedAccessCurrent(access),false);
  }finally{Date.now=now;}
  assert.equal((await records()).length,0);
  assert.deepEqual((await unlockAppKey(password)).privateKey,privateKey);
});

test('lock deletes the remembered key; forget also deletes the encrypted vault',async()=>{
  const access=await remembered();
  const locked=clearRememberedAppKey();
  assert.equal(rememberedAccessCurrent(access),false,'invalidate before asynchronous deletion');
  await locked;
  assert.equal((await records()).length,0);
  assert.equal(await unlockRememberedAppKey(),null);
  assert.ok(storedAccount());
  await rememberAppKey(password,account);
  await forgetAppKey();
  assert.equal((await records()).length,0);
  assert.equal(storedAccount(),null);
});

test('replacing or re-encrypting a vault invalidates previously remembered access',async()=>{
  const access=await remembered();
  await saveAppKey('replacement fixture passphrase',privateKey,account);
  assert.equal(rememberedAccessCurrent(access),false);
  assert.equal(await unlockRememberedAppKey(),null);
  assert.equal((await records()).length,0);
  assert.deepEqual((await unlockAppKey('replacement fixture passphrase')).privateKey,privateKey);
});

test('tampered vaults, expiry tickets, and missing IndexedDB keys cannot auto-unlock',async()=>{
  for(const tamper of ['vault','expiry','missing','extractable']){
    const access=await remembered();
    if(tamper==='vault'){
      const v=JSON.parse(storage.get(STORAGE_KEY)!);v.fid=999;storage.set(STORAGE_KEY,JSON.stringify(v));
    }else if(tamper==='expiry')storage.set(REMEMBER_KEY,JSON.stringify({...access,expiresAt:access.expiresAt+86400000}));
    else if(tamper==='missing')await records(store=>{store.clear();});
    else{
      const [record]=await records();
      record.unlockKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['decrypt']);
      await records(store=>{store.put(record,access.id);});
    }
    assert.equal(await unlockRememberedAppKey(),null,tamper);
    assert.equal(storage.get(REMEMBER_KEY),undefined,tamper);
    assert.equal((await records()).length,0,tamper);
  }
});

test('a wrong passphrase or account cannot create remembered access',async()=>{
  await saveAppKey(password,privateKey,account);
  await assert.rejects(rememberAppKey('incorrect password',account));
  assert.equal(await unlockRememberedAppKey(),null);
  await assert.rejects(rememberAppKey(password,{...account,fid:999}),/account changed/);
  assert.equal((await records()).length,0);
});

test('locking during passphrase derivation cancels remembering and leaves no device key',async()=>{
  await saveAppKey(password,privateKey,account);
  const pending=rememberAppKey(password,account);
  // Attach immediately: cancellation may reject before the next assertion awaits it.
  const rejection=assert.rejects(pending,/access changed/);
  for(let n=0;n<100&&!storage.get(REMEMBER_KEY);n++)await new Promise(resolve=>setTimeout(resolve,2));
  assert.ok(storage.get(REMEMBER_KEY));
  await clearRememberedAppKey();
  await rejection;
  assert.equal(storage.get(REMEMBER_KEY),undefined);
  assert.equal((await records()).length,0);
});

test('unsupported browser storage preserves manual passphrase unlock and rejects remembering',async()=>{
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});
  await saveAppKey(password,privateKey,account);
  await assert.rejects(rememberAppKey(password,account),/cannot remember/);
  assert.deepEqual((await unlockAppKey(password)).privateKey,privateKey);
  assert.equal(storage.get(REMEMBER_KEY),undefined);
});

test('remembered local keys never restore or become enabled on network origins',async()=>{
  await remembered();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{hostname:'192.0.2.1'}}});
  assert.equal(await unlockRememberedAppKey(),null);
  await assert.rejects(rememberAppKey(password,account),/localhost/);
  await assert.rejects(restoreRememberedSession(config),/localhost/);
});

async function nodeFixture(options:{revoked?:boolean;expired?:boolean;scopes?:number[];units?:number;onchain?:boolean;hold?:()=>Promise<void>},run:(reads:string[])=>Promise<void>){
  const original=globalThis.fetch,reads:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);reads.push(url);
    if(url.startsWith('https://rpc.example')){
      assert.ok(options.onchain);const rpc=JSON.parse(String(init?.body));assert.equal(rpc.method,'eth_call');
      return Response.json({jsonrpc:'2.0',id:rpc.id,result:encodeFunctionResult({abi:keyRegistryABI,functionName:'keys',result:[options.revoked?2:1,1]})});
    }
    assert.equal(init?.method,undefined,'restoring must not submit any message');
    if(url.includes('signersByFid')){
      await options.hold?.();
      return Response.json({signers:options.revoked?[]:[{...account,keyType:1,source:2,expiresAt:Math.floor(Date.now()/1000)+(options.expired?-1:86400),scopes:options.scopes??GASLESS_SCOPES}],currentUserNonce:1,gaslessSignerCount:1,gaslessSignerLimit:1000});
    }
    assert.ok(url.includes('storageLimitsByFid'),'unexpected network request');
    return Response.json({units:options.units??1});
  };
  try{await run(reads);}finally{globalThis.fetch=original;}
}

test('automatic restore revalidates gasless scopes, expiry, and storage without writes',async()=>{
  const access=await remembered();
  await nodeFixture({},async reads=>{
    const session=await restoreRememberedSession(config);
    assert.equal(session?.fid,account.fid);assert.equal(session?.key,key);
    assert.deepEqual(session?.remembered,access);
    assert.equal(bytesToHex((await session!.signer.getSignerKey())._unsafeUnwrap()),key);
    assert.equal(reads.length,2);
  });
});

test('revoked, expired, or insufficiently scoped gasless signers and accounts without storage cannot auto-reconnect',async()=>{
  for(const options of [{revoked:true},{expired:true},{scopes:[1]},{units:0}]){
    await remembered();
    await nodeFixture(options,async()=>{await assert.rejects(restoreRememberedSession(config),options.units===0?/no active storage/:/missing, expired, revoked/);});
    assert.equal(await unlockRememberedAppKey(),null);
    assert.equal((await records()).length,0);
    assert.ok(storedAccount(),'keep the passphrase-encrypted vault for manual recovery');
  }
});

test('automatic restore checks legacy onchain registration and storage too',async()=>{
  const legacy={...account,registration:undefined};
  await saveAppKey(password,privateKey,legacy);await rememberAppKey(password,legacy);
  await nodeFixture({onchain:true},async reads=>{
    assert.equal((await restoreRememberedSession(config))?.key,key);
    assert.equal(reads.length,2);
  });
  await nodeFixture({onchain:true,units:0},async()=>{await assert.rejects(restoreRememberedSession(config),/no active storage/);});
});

test('locking while node validation is pending prevents a late automatic reconnection',async()=>{
  await remembered();let release!:()=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
  await nodeFixture({hold:async()=>{started();await held;}},async()=>{
    const pending=restoreRememberedSession(config);
    await entered;await clearRememberedAppKey();release();
    assert.equal(await pending,null);
  });
  assert.equal((await records()).length,0);
});
