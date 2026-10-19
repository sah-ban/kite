import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared server middleware.
import { profileCounts } from '../profile-counts.mjs';
async function call(middleware:ReturnType<typeof profileCounts>,path='/api/profile/counts?fid=37',method='GET'){
  let status=200,body='';const res={get statusCode(){return status;},set statusCode(value){status=value;},setHeader(){},end(value:string){body=value;}};
  await middleware({url:path,method},res,()=>{throw new Error('Unexpected next');});return {status,body:JSON.parse(body)};
}
test('profile counts use a fixed provider, share in-flight reads, return only totals and refresh after a minute',async()=>{
  let now=1000;const calls:URL[]=[];
  const middleware=profileCounts({now:()=>now,fetch:async(url:URL,options:RequestInit)=>{calls.push(url);assert.equal(options.redirect,'error');assert.ok(options.signal);return Response.json({result:{user:{fid:37,followerCount:61007,followingCount:57,username:'ignored',profile:{bio:'unrelated'}}}});}});
  const [first,second]=await Promise.all([call(middleware),call(middleware)]);assert.deepEqual(first,{status:200,body:{fid:37,followerCount:61007,followingCount:57}});assert.deepEqual(second,first);assert.equal(calls.length,1);
  assert.equal(calls[0].href,'https://api.farcaster.xyz/v2/user?fid=37');await call(middleware);assert.equal(calls.length,1);now+=60_001;await call(middleware);assert.equal(calls.length,2);
});
test('zero counts are valid; invalid, mismatched and failed responses are not cached',async()=>{
  let user:unknown={fid:37,followerCount:0,followingCount:0},fail=false,calls=0;
  const middleware=profileCounts({fetch:async()=>{calls++;return fail?Response.json({error:'Private upstream detail'},{status:429}):Response.json({result:{user}});}});
  for(const bad of [null,{fid:88,followerCount:1,followingCount:2},{fid:37,followerCount:-1,followingCount:2},{fid:37,followerCount:'10',followingCount:2},{fid:37,followerCount:1,followingCount:1.5},{fid:37,followerCount:1}]){user=bad;assert.equal((await call(middleware)).status,502);}
  fail=true;const failed=await call(middleware);assert.equal(failed.status,502);assert.ok(!JSON.stringify(failed).includes('Private upstream detail'));
  fail=false;user={fid:37,followerCount:0,followingCount:0};assert.deepEqual((await call(middleware)).body,{fid:37,followerCount:0,followingCount:0});assert.equal(calls,8);
});
test('invalid FIDs and methods never contact the provider',async()=>{
  let calls=0;const middleware=profileCounts({fetch:async()=>{calls++;throw new Error('Unexpected request');}});
  for(const fid of ['', '0','-1','abc','1.5','9007199254740992'])assert.equal((await call(middleware,'/api/profile/counts?fid='+fid)).status,400);
  assert.equal((await call(middleware,'/api/profile/counts?fid=37','POST')).status,405);assert.equal(calls,0);
});
