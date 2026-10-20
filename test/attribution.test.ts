import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters} from 'viem';
import {attribute,metadataAbi,signerRequester} from '../src/lib/attribution';
import type {Cast,Config} from '../src/lib/hub';
const config:Config={readUrl:'https://read.example',optimismRpcUrl:'',useGateway:true};
const key=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const metadata=(fid:number)=>encodeAbiParameters(metadataAbi,[{requestFid:BigInt(fid),requestSigner:'0x'+'11'.repeat(20) as `0x${string}`,signature:'0x1234',deadline:2000000000n}]);

test('attribution merges paginated gasless requesters with existing onchain metadata',async()=>{
 const original=globalThis.fetch,calls:URL[]=[];
 globalThis.fetch=async(input)=>{
  const u=new URL(String(input),'https://client.example');calls.push(u);
  if(u.pathname.endsWith('onChainSignersByFid'))return Response.json({events:[{signerEventBody:{key:key(1),metadata:metadata(9152)}}]});
  return Response.json(u.searchParams.has('pageToken')?{signers:[{fid:10001,key:key(3),keyType:1,source:2,requestFid:'10001'}]}:{signers:[{fid:10001,key:key(2),keyType:1,source:'SIGNER_SOURCE_OFFCHAIN',requestFid:20002}],nextPageToken:'opaque+/='});
 };
 try{
  assert.equal(await signerRequester(config,10001,key(1)),9152);
  assert.equal(await signerRequester(config,10001,key(2).toUpperCase().replace('0X','0x')),20002);
  assert.equal(await signerRequester(config,10001,key(3)),10001,'self-authorized keys must identify the actual requester');
  const map=await attribute(config,[{signer:key(2),data:{fid:10001}} as Cast]);assert.equal(map.get(key(2)),20002);
  assert.equal(calls.length,3);assert.ok(calls.some(u=>u.searchParams.get('pageToken')==='opaque+/='));
 }finally{globalThis.fetch=original;}
});

test('unified onchain records work without legacy history; invalid requester records stay unknown',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('onChainSignersByFid')?new Response('unavailable',{status:503}):Response.json({signers:[
  {fid:10002,key:key(4),keyType:1,source:'SIGNER_SOURCE_ONCHAIN',onChainEvent:{signerEventBody:{key:key(4),metadata:metadata(9152)}}},
  {fid:999,key:key(5),keyType:1,source:2,requestFid:9152},
  {fid:10002,key:key(6),keyType:1,source:2,requestFid:'9007199254740992'},
  {fid:10002,key:key(7),keyType:1,source:2,requestFid:0},
  {fid:10002,key:key(8),keyType:2,source:2,requestFid:9152},
 ]});
 try{
  assert.equal(await signerRequester(config,10002,key(4)),9152);
  for(const n of [5,6,7,8])assert.equal(await signerRequester(config,10002,key(n)),undefined);
 }finally{globalThis.fetch=original;}
});

test('older nodes keep onchain attribution when the unified signer endpoint is unavailable',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('signersByFid')?new Response('unsupported',{status:404}):Response.json({events:[{signerEventBody:{key:key(9),metadata:metadata(9152)}}]});
 try{assert.equal(await signerRequester(config,10003,key(9)),9152);}finally{globalThis.fetch=original;}
});

test('empty attribution caches expire so new signer registrations become visible',async()=>{
 const original=globalThis.fetch,originalNow=Date.now;let now=originalNow(),registered=false;
 Date.now=()=>now;
 globalThis.fetch=async(input)=>String(input).includes('onChainSignersByFid')?Response.json({events:[]}):Response.json({signers:registered?[{fid:10004,key:key(10),keyType:1,source:2,requestFid:9152}]:[]});
 try{
  assert.equal(await signerRequester(config,10004,key(10)),undefined);registered=true;now+=6000;
  assert.equal(await signerRequester(config,10004,key(10)),9152);
 }finally{globalThis.fetch=original;Date.now=originalNow;}
});

test('failed lookups can retry and different read-node configurations do not share attribution',async()=>{
 const original=globalThis.fetch;let fail=true,requestFid=9152;
 globalThis.fetch=async(input)=>fail?new Response('offline',{status:503}):String(input).includes('onChainSignersByFid')?Response.json({events:[]}):Response.json({signers:[{fid:10005,key:key(11),keyType:1,source:2,requestFid}]});
 try{
  await assert.rejects(signerRequester(config,10005,key(11)),/Could not read signer attribution/);fail=false;
  assert.equal(await signerRequester(config,10005,key(11)),9152);requestFid=1234;
  assert.equal(await signerRequester({...config,readUrl:'https://other.example'},10005,key(11)),1234);
 }finally{globalThis.fetch=original;}
});
