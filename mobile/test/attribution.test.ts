import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters} from 'viem';
import {createAttribution,metadataAbi} from '../src/lib/attribution';
const key=(value:number)=>'0x'+value.toString(16).padStart(64,'0');
const metadata=(fid:number)=>encodeAbiParameters(metadataAbi,[{requestFid:BigInt(fid),requestSigner:'0x'+'11'.repeat(20) as `0x${string}`,signature:'0x1234',deadline:2000000000n}]);

test('client labels resolve paginated onchain and offchain signers, coalesce reads and preserve actual requesters',async()=>{
  let calls=0;
  const resolve=createAttribution(async<T>(endpoint:string,params:Record<string,string|number>):Promise<T>=>{
    calls++;
    return (endpoint==='onChainSignersByFid'?{events:[{signerEventBody:{key:key(1),metadata:metadata(925685)}}]}:params.pageToken?{signers:[{fid:37,key:key(3),keyType:1,source:2,requestFid:'37'}]}:{signers:[{fid:37,key:key(2),keyType:1,source:'SIGNER_SOURCE_OFFCHAIN',requestFid:16823}],nextPageToken:'next'}) as T;
  });
  assert.deepEqual(await Promise.all([resolve(37,key(1)),resolve(37,key(2)),resolve(37,key(3))]),[925685,16823,37]);assert.equal(calls,3);
  assert.equal(await resolve(37,key(1).toUpperCase().replace('0X','0x')),925685);assert.equal(calls,3);
});
test('legacy fallback supports base64 metadata and rejects invalid signer identities',async()=>{
  const resolve=createAttribution(async<T>(endpoint:string):Promise<T>=>{
    if(endpoint==='signersByFid')throw Error('Unsupported');
    return {events:[{signerEventBody:{key:key(1),metadata:Buffer.from(metadata(925685).slice(2),'hex').toString('base64')}},{signerEventBody:{key:key(2),metadata:'malformed'}}]} as T;
  });
  assert.equal(await resolve(37,key(1)),925685);assert.equal(await resolve(37,key(2)),undefined);assert.equal(await resolve(37,'bad'),undefined);
  const invalid=createAttribution(async<T>(endpoint:string):Promise<T>=>(endpoint==='onChainSignersByFid'?{events:[]}:{signers:[{fid:99,key:key(1),keyType:1,source:2,requestFid:925685},{fid:37,key:key(2),keyType:2,source:2,requestFid:925685},{fid:37,key:key(3),keyType:1,source:2,requestFid:'9007199254740992'}]}) as T);
  for(const n of [1,2,3])assert.equal(await invalid(37,key(n)),undefined);
});
test('unknown clients expire quickly and failed reads can retry',async()=>{
  let now=1000,registered=false,fail=false;
  const resolve=createAttribution(async<T>(endpoint:string):Promise<T>=>{if(fail)throw Error('Offline');return (endpoint==='onChainSignersByFid'?{events:[]}:{signers:registered?[{fid:37,key:key(1),keyType:1,source:2,requestFid:925685}]:[]}) as T;},()=>now);
  assert.equal(await resolve(37,key(1)),undefined);registered=true;now+=5001;assert.equal(await resolve(37,key(1)),925685);
  fail=true;now+=30001;await assert.rejects(resolve(37,key(1)),/unavailable/);fail=false;assert.equal(await resolve(37,key(1)),925685);
});
