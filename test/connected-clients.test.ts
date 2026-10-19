import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters } from 'viem';
import { connectedClients, readConnectedClients } from '../src/lib/connected-clients';
import { metadataAbi } from '../src/lib/attribution';
import type { Config } from '../src/lib/hub';
const key=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const metadata=(fid:number)=>encodeAbiParameters(metadataAbi,[{requestFid:BigInt(fid),requestSigner:'0x'+'11'.repeat(20) as `0x${string}`,signature:'0x1234',deadline:2000000000n}]);
const signer=(n:number,requestFid:unknown=900)=>({fid:37,key:key(n),keyType:1,source:2,requestFid});
const config:Config={readUrl:'/api/read',validatorUrl:'',optimismRpcUrl:'',useGateway:true};

test('connected clients group distinct active keys by requester across onchain and gasless sources',()=>{
  const encoded=metadata(900),base64=Buffer.from(encoded.slice(2),'hex').toString('base64');
  const result=connectedClients([signer(1),{...signer(1),key:key(1).toUpperCase().replace('0X','0x')},{...signer(2),source:'SIGNER_SOURCE_ONCHAIN',onChainEvent:{signerEventBody:{metadata:base64,eventType:'SIGNER_EVENT_TYPE_ADD'}}},{...signer(3),source:1,onChainEvent:{signerEventBody:{metadata:metadata(901),eventType:1}}},{...signer(4,37),source:'SIGNER_SOURCE_OFFCHAIN'},signer(5,0)],37,1000);
  assert.deepEqual(result,{clients:[{fid:37,keyCount:1},{fid:900,keyCount:2},{fid:901,keyCount:1}],unknownKeys:1});
});
test('connected clients exclude expired, revoked, malformed and unrelated keys without hiding unattributed active keys',()=>{
  const result=connectedClients([{...signer(1),expiresAt:1000},{...signer(2),expiresAt:'999'},{...signer(3),expiresAt:'1001'},{...signer(4),expiresAt:0},{...signer(5),expiresAt:'invalid'},{...signer(6),source:1,onChainEvent:{signerEventBody:{metadata:metadata(900),eventType:'SIGNER_EVENT_TYPE_REMOVE'}}},{...signer(7),fid:88},{...signer(8),keyType:2},{...signer(9),key:'broken'},signer(10,'9007199254740992'),{...signer(11),source:1,onChainEvent:{signerEventBody:{metadata:'broken'}}},null],37,1000);
  assert.deepEqual(result,{clients:[{fid:900,keyCount:2}],unknownKeys:2});assert.deepEqual(connectedClients([],37),{clients:[],unknownKeys:0});
});
test('connected client reads paginate all active signer pages and deduplicate keys across pages',async()=>{
  const original=globalThis.fetch,calls:URL[]=[];
  globalThis.fetch=async(input,init)=>{assert.ok(init?.signal);const url=new URL(String(input),'https://freecast.example');calls.push(url);return Response.json(url.searchParams.has('pageToken')?{signers:[signer(1),signer(2,901)]}:{signers:[signer(1)],nextPageToken:'opaque+/='});};
  try{assert.deepEqual(await readConnectedClients(config,37),{clients:[{fid:900,keyCount:1},{fid:901,keyCount:1}],unknownKeys:0});assert.equal(calls.length,2);assert.equal(calls[0].pathname,'/api/read/v1/signersByFid');assert.equal(calls[0].searchParams.get('fid'),'37');assert.equal(calls[0].searchParams.get('pageSize'),'100');assert.equal(calls[1].searchParams.get('pageToken'),'opaque+/=');}
  finally{globalThis.fetch=original;}
});
test('failed or malformed pagination never returns a partial connected client list',async()=>{
  const original=globalThis.fetch;let mode='failure',calls=0;
  globalThis.fetch=async()=>{calls++;if(calls===1)return Response.json({signers:[signer(1)],nextPageToken:'more'});return mode==='failure'?new Response('Offline',{status:503}):mode==='repeat'?Response.json({signers:[],nextPageToken:'more'}):mode==='cursor'?Response.json({signers:[],nextPageToken:0}):Response.json({signers:'invalid'});};
  try{for(mode of ['failure','repeat','cursor','malformed']){calls=0;await assert.rejects(readConnectedClients(config,37));assert.equal(calls,2);}}
  finally{globalThis.fetch=original;}
});
test('invalid profile FIDs are rejected without contacting the node',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected read');};
  try{for(const fid of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(readConnectedClients(config,fid),/Invalid profile FID/);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
