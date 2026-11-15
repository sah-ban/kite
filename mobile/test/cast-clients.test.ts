import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/lib/api';
import {resolveCastClient,knownCastClient} from '../src/lib/cast-clients';

const key='0x'+'11'.repeat(32);
function harness(clientFid:number,authorFid=37){
  const calls:URL[]=[];
  const api=createApi('https://kite.example',async input=>{
    const url=new URL(String(input));calls.push(url);
    if(url.pathname.endsWith('onChainSignersByFid'))return Response.json({events:[]});
    if(url.pathname.endsWith('signersByFid'))return Response.json({signers:[{fid:authorFid,key,keyType:1,source:2,requestFid:clientFid}]});
    assert.ok(url.pathname.endsWith('userDataByFid'));
    return Response.json({messages:[{data:{userDataBody:{type:6,value:'customclient'}}},{data:{userDataBody:{type:2,value:'Custom Client'}}},{data:{userDataBody:{type:1,value:'https://example.com/avatar.gif'}}}]});
  });return {api,calls};
}
test('known clients use saved identities without fetching their profiles',async()=>{
  for(const [fid,username,logo] of [[9152,'warpcast','warpcast'],[16823,'fireflyapp','firefly'],[925685,'kiteapp','kite']] as const){
    const h=harness(fid),client=await resolveCastClient(h.api,37,key);
    assert.equal(client?.fid,fid);assert.equal(client?.username,username);assert.equal(client?.logo,logo);
    assert.equal(h.calls.filter(url=>url.pathname.endsWith('userDataByFid')).length,0);
  }
  assert.equal(knownCastClient(123456),undefined);
});
test('self-requesting clients reuse the author profile request, including animated avatars',async()=>{
  const h=harness(37),author=h.api.profile(37),client=resolveCastClient(h.api,37,key);
  const [profile,resolved]=await Promise.all([author,client]);
  assert.equal(resolved?.fid,37);assert.equal(resolved?.username,profile.username);assert.equal(resolved?.avatar,profile.avatar);assert.equal(resolved?.logo,undefined);
  assert.equal(h.calls.filter(url=>url.pathname.endsWith('userDataByFid')).length,1);
});
test('unknown clients retain dynamic profile lookup and are not inferred from the author',async()=>{
  const h=harness(123456),client=await resolveCastClient(h.api,37,key);
  assert.equal(client?.fid,123456);assert.equal(client?.username,'customclient');assert.equal(client?.logo,undefined);
  assert.equal(h.calls.find(url=>url.pathname.endsWith('userDataByFid'))?.searchParams.get('fid'),'123456');
});
