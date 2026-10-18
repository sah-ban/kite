import test from 'node:test';
import assert from 'node:assert/strict';
import { ID_REGISTRY_ADDRESS, idRegistryABI } from '@farcaster/core';
import type * as GaslessSdk from '@farcaster/core-gasless';
import {loadGaslessSdk} from '../src/lib/gasless-sdk';
const sdk=await loadGaslessSdk();
import { bytesToHex, decodeFunctionData, encodeFunctionResult, hexToBytes } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { prepareKey, unlockSession, encodeForSnapchain, react } from '../src/lib/signing';
import { checkGaslessSigner, GASLESS_SCOPES, GASLESS_TTL } from '../src/lib/gasless';
import { storedAccount, unlockAppKey } from '../src/lib/vault';
import type { Config } from '../src/lib/hub';

// Public, deterministic test mnemonic. All network calls are mocked.
const phrase='test test test test test test test test test test test junk';
const password='gasless fixture passphrase';
const address=mnemonicToAccount(phrase).address;
const fid=123;
const config:Config={readUrl:'/api/read',validatorUrl:'/api/write',optimismRpcUrl:'https://rpc.example',useGateway:true};
type Options={units?:number;nonce?:number;limit?:number;count?:number;submitFails?:boolean;saveFails?:boolean;unregistered?:boolean;networkOrigin?:boolean;delayMerge?:boolean};
async function environment(options:Options,run:(env:{writes:GaslessSdk.Message[];reads:string[];setSigner:(value:any)=>void})=>Promise<void>){
  const original=globalThis.fetch,saved=new Map<string,string>(),writes:GaslessSdk.Message[]=[],reads:string[]=[];
  let activeSigner:any;
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{hostname:options.networkOrigin?'192.0.2.1':'localhost'}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)||null,setItem:(k:string,v:string)=>{if(options.saveFails)throw new Error('Storage full');saved.set(k,v);},removeItem:(k:string)=>saved.delete(k)}});
  globalThis.fetch=async(input,init)=>{
    const url=String(input);reads.push(url);
    if(new URL(url,'https://client.example').href===new URL(config.optimismRpcUrl).href){
      const rpc=JSON.parse(String(init?.body));assert.equal(rpc.method,'eth_call','gasless registration must never estimate gas or broadcast an Ethereum transaction');
      assert.equal(rpc.params[0].to.toLowerCase(),ID_REGISTRY_ADDRESS.toLowerCase());
      const call=decodeFunctionData({abi:idRegistryABI,data:rpc.params[0].data});assert.equal(call.functionName,'idOf');assert.equal(String(call.args?.[0]).toLowerCase(),address.toLowerCase());
      return Response.json({jsonrpc:'2.0',id:rpc.id,result:encodeFunctionResult({abi:idRegistryABI,functionName:'idOf',result:BigInt(options.unregistered?0:fid)})});
    }
    assert.ok(!String(init?.body).includes(phrase));assert.ok(!String(init?.body).includes(password));
    if(url.includes('storageLimitsByFid'))return Response.json({units:options.units??1});
    if(url.includes('signersByFid'))return Response.json({signers:activeSigner?[activeSigner]:[],currentUserNonce:options.nonce??7,gaslessSignerCount:options.count??0,gaslessSignerLimit:options.limit??1000});
    if(url.startsWith('/api/write/')){
      assert.equal(init?.method,'POST');assert.equal(init?.headers&&new Headers(init.headers).get('content-type'),'application/octet-stream');
      assert.ok(storedAccount(),'encrypted key must be durable before submission');
      const message=sdk.Message.decode(new Uint8Array(await new Response(init?.body).arrayBuffer()));
      message.data=sdk.MessageData.decode(message.dataBytes!);writes.push(message);
      if(options.submitFails)return new Response('node rejected registration',{status:400});
      if(message.data.type===sdk.MessageType.KEY_ADD&&!options.delayMerge){const body=message.data.keyAddBody!;activeSigner={fid,key:bytesToHex(body.key),keyType:1,source:'SIGNER_SOURCE_OFFCHAIN',scopes:body.scopes,expiresAt:Math.floor(Date.now()/1000)+body.ttl};}
      return Response.json({hash:bytesToHex(message.hash)});
    }
    throw new Error('Unexpected request: '+url);
  };
  try{await run({writes,reads,setSigner:value=>{activeSigner=value;}});}finally{globalThis.fetch=original;}
}

test('custody phrase registration builds verified gasless authorization and unlocks without Ethereum writes',async()=>{
  await environment({},async({writes,reads})=>{
    const prepared=await prepareKey(config,phrase,password,0);
    assert.equal(prepared.fid,fid);assert.equal(prepared.address,address);assert.equal(prepared.ttlSeconds,GASLESS_TTL);
    assert.equal(writes.length,0);assert.equal(storedAccount(),null);
    const session=await prepared.register();assert.equal(writes.length,1);
    const message=writes[0],body=message.data!.keyAddBody!;
    assert.equal(message.data!.type,sdk.MessageType.KEY_ADD);assert.equal(body.nonce,8);assert.deepEqual(body.scopes,GASLESS_SCOPES);assert.equal(body.ttl,GASLESS_TTL);assert.equal(body.registrationTxHash.length,0);
    assert.equal(bytesToHex(message.signer),session.key);assert.equal(bytesToHex(body.key),session.key);
    const valid=await sdk.validations.validateMessage(message);assert.ok(valid.isOk(),valid.isErr()?valid.error.message:'');
    assert.equal((await sdk.verifyKeyAdd({fid:BigInt(fid),key:body.key,keyType:body.keyType,scopes:body.scopes,ttl:body.ttl,nonce:body.nonce,deadline:BigInt(body.deadline)},body.custodySignature,hexToBytes(address)))._unsafeUnwrap(),true);
    const metadata=sdk.decodeGaslessSignedKeyRequestMetadata(body.metadata)._unsafeUnwrap();assert.equal(metadata.requestFid,BigInt(fid));
    assert.equal((await sdk.verifyGaslessKeyRequest({requestFid:metadata.requestFid,key:body.key,deadline:metadata.deadline},metadata.signature,hexToBytes(address)))._unsafeUnwrap(),true);
    assert.deepEqual(sdk.Message.decode(encodeForSnapchain(message as any)).dataBytes,message.dataBytes);
    const vault=localStorage.getItem('freecast.app-key.v1')!;assert.ok(!vault.includes(password));assert.ok(!vault.includes(phrase));assert.equal(storedAccount()?.registration,'gasless');
    const unlocked=await unlockSession(config,password);assert.equal(unlocked.key,session.key);
    await react(config,unlocked,{hash:'0x'+'ab'.repeat(20),data:{fid:37}} as any,'like');
    assert.equal(writes[1].data!.type,sdk.MessageType.REACTION_ADD);
    assert.ok(!reads.some(url=>url.includes('onChainSignersByFid')));
    await assert.rejects(prepared.register(),/fresh registration/);
    prepared.discard();assert.equal(bytesToHex((await session.signer.getSignerKey())._unsafeUnwrap()),session.key);
  });
});

test('gasless setup validates prerequisites and does not submit before explicit registration',async()=>{
  for(const [options,expected] of [[{units:0},/no active storage/],[{unregistered:true},/No FID/],[{limit:1,count:1},/signer limit/],[{nonce:-1},/valid gasless signer nonce/]] as const){
    await environment(options,async({writes})=>{await assert.rejects(prepareKey(config,phrase,password,0),expected);assert.equal(writes.length,0);assert.equal(storedAccount(),null);});
  }
  await environment({},async({writes,reads})=>{
    await assert.rejects(prepareKey({...config,validatorUrl:''},phrase,password,0),/VALIDATOR_URL/);
    await assert.rejects(prepareKey(config,phrase,'short',0),/12 characters/);
    await assert.rejects(prepareKey(config,phrase,password,-1),/index/);
    assert.equal(reads.length,0);
    const prepared=await prepareKey(config,phrase,password,0);prepared.discard();await assert.rejects(prepared.register(),/fresh registration/);assert.equal(writes.length,0);
  });
  await environment({networkOrigin:true},async({reads})=>{await assert.rejects(prepareKey(config,phrase,password,0),/localhost/);assert.equal(reads.length,0);});
});

test('failed submission preserves the encrypted key, but storage failure prevents submission',async()=>{
  await environment({submitFails:true},async({writes})=>{
    const prepared=await prepareKey(config,phrase,password,0);
    await assert.rejects(prepared.register(),/node rejected/);assert.equal(writes.length,1);assert.equal(storedAccount()?.key,prepared.key);
    assert.equal((await unlockAppKey(password)).key,prepared.key);prepared.discard();
  });
  await environment({saveFails:true},async({writes})=>{const prepared=await prepareKey(config,phrase,password,0);await assert.rejects(prepared.register(),/Storage full/);assert.equal(writes.length,0);prepared.discard();});
});

test('gasless unlock rejects revoked, expired, wrong-FID or insufficient-scope keys; metadata is authenticated',async()=>{
  await environment({},async({setSigner})=>{
    const prepared=await prepareKey(config,phrase,password,0);await prepared.register();
    const active={fid,key:prepared.key,keyType:1,source:2,scopes:GASLESS_SCOPES,expiresAt:Math.floor(Date.now()/1000)+3600};
    for(const signer of [undefined,{...active,expiresAt:1},{...active,fid:999},{...active,scopes:[1]},{...active,source:1}]){
      setSigner(signer);await assert.rejects(unlockSession(config,password),/missing, expired, revoked/);
    }
    setSigner(active);assert.equal(await checkGaslessSigner(config,fid,prepared.key),true);
    const raw=JSON.parse(localStorage.getItem('freecast.app-key.v1')!);delete raw.registration;localStorage.setItem('freecast.app-key.v1',JSON.stringify(raw));
    await assert.rejects(unlockAppKey(password),/Could not unlock/);
  });
});


test('unconfirmed submission stays recoverable, and registration cannot run twice concurrently',async()=>{
  await environment({delayMerge:true},async({writes,setSigner})=>{
    const prepared=await prepareKey(config,phrase,password,0);
    const originalTimer=globalThis.setTimeout;
    globalThis.setTimeout=((callback:any,delay?:number,...args:any[])=>originalTimer(callback,delay===1500?0:delay,...args)) as typeof setTimeout;
    try{
      const registering=prepared.register();
      await assert.rejects(prepared.register(),/already in progress/);
      await assert.rejects(registering,/inclusion is not confirmed/);
    }finally{globalThis.setTimeout=originalTimer;}
    assert.equal(writes.length,1);assert.equal(storedAccount()?.key,prepared.key);
    setSigner({fid,key:prepared.key,keyType:1,source:2,scopes:GASLESS_SCOPES,expiresAt:Math.floor(Date.now()/1000)+GASLESS_TTL});
    const session=await prepared.register();assert.equal(session.key,prepared.key);assert.equal(writes.length,1,'retry after merge must not broadcast another key');
  });
});
