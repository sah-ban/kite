import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/lib/api';
import {normalizeServer,parseSearch,mergeCasts,type Cast} from '../src/lib/model';

const hash='0x572549b948717ab9302a492c197121b0b844e7c8';
const cast:Cast={hash,signer:'public-key',data:{fid:1059075,timestamp:100,castAddBody:{text:'Hello Kite',mentions:[],mentionsPositions:[],embeds:[]}}};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

test('server configuration accepts only credential-free HTTPS origins',()=>{
  assert.equal(normalizeServer(' https://kite.example/ '),'https://kite.example');
  for(const value of ['http://kite.example','file:///tmp/key','https://user:pass@kite.example','https://kite.example/api','https://kite.example/?token=private','https://kite.example/#private']) assert.throws(()=>normalizeServer(value));
});
test('search resolves FIDs, usernames and full Kite/Farcaster cast links',()=>{
  assert.deepEqual(parseSearch('@kiteapp'),{kind:'profile',value:'kiteapp'});
  assert.deepEqual(parseSearch('https://farcaster.xyz/~/profiles/268438'),{kind:'profile',value:'268438'});
  assert.deepEqual(parseSearch(`https://kite.sahban.dev/cast/1059075/${hash}`),{kind:'cast',author:'1059075',hash});
  assert.deepEqual(parseSearch('https://farcaster.xyz/balajis.eth/0x50184b62'),{kind:'cast',author:'balajis.eth',hash:'0x50184b62'});
  for(const value of ['0','-1','https://evil.example/37','javascript:alert(1)','https://farcaster.xyz@evil.example/37','https://farcaster.xyz:9999/37']) assert.throws(()=>parseSearch(value));
});
test('feed requests use the selected gateway, preserve cursors and discard removed/malformed messages',async()=>{
  const urls:URL[]=[];
  const api=createApi('https://kite.example',async(input,init)=>{
    urls.push(new URL(String(input)));assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');assert.ok(init?.signal);
    return json({messages:[cast,cast,{hash,data:{fid:1,castRemoveBody:{}}},{hash:'bad'}],nextPageToken:'opaque+/='});
  });
  const first=await api.publicFeed();assert.equal(first.items.length,1);
  await api.publicFeed(first.next);
  assert.equal(urls[1].origin,'https://kite.example');assert.equal(urls[1].pathname,'/api/feed/public');assert.equal(urls[1].searchParams.get('cursor'),'opaque+/=');
  assert.equal(mergeCasts(first.items,[cast]).length,1);
});
test('full cast lookup validates the returned author and hash',async()=>{
  const api=createApi('https://kite.example',async()=>json(cast));
  assert.deepEqual(await api.resolveCast('1059075',hash),cast);
  await assert.rejects(api.resolveCast('37',hash),/requested cast/);
});
test('profiles coalesce requests and a failed lookup can be retried',async()=>{
  let calls=0;
  const api=createApi('https://kite.example',async()=>{
    calls++;if(calls===1)return json({},502);
    return json({messages:[{data:{userDataBody:{type:6,value:'kiteapp'}}},{data:{userDataBody:{type:'USER_DATA_TYPE_DISPLAY',value:'Kite'}}}]});
  });
  await assert.rejects(api.profile(925685));
  const [a,b]=await Promise.all([api.profile(925685),api.profile(925685)]);
  assert.equal(calls,2);assert.deepEqual(a,b);assert.equal(a.name,'Kite');assert.equal(a.username,'kiteapp');
});
test('cast-not-found and server failures do not expose raw node diagnostics',async()=>{
  const missing=createApi('https://kite.example',async()=>json({error_detail:'status: NotFound, message: private internal URL'},400));
  await assert.rejects(missing.resolveCast('1059075',hash),error=>error instanceof Error&&error.message.includes('unavailable')&&!error.message.includes('private'));
  const failed=createApi('https://kite.example',async()=>json({error:'private server details'},500));
  await assert.rejects(failed.publicFeed(),error=>error instanceof Error&&!error.message.includes('private'));
});
test('replies and reactions are restricted to their requested target',async()=>{
  const reply:Cast={...cast,hash:'0x1746cf1f74735f808c28b8c34bf93d2ffab9a0f2',data:{...cast.data,castAddBody:{...cast.data.castAddBody,parentCastId:{fid:cast.data.fid,hash}}}};
  const api=createApi('https://kite.example',async input=>String(input).includes('castsByParent')?json({messages:[reply,cast]}):json({messages:[{data:{type:3,fid:37,reactionBody:{type:1,targetCastId:{fid:cast.data.fid,hash}}}},{data:{type:3,fid:38,reactionBody:{type:2,targetCastId:{fid:cast.data.fid,hash}}}},{data:{type:3,fid:39,reactionBody:{type:1,targetCastId:{fid:999,hash}}}}]}));
  assert.deepEqual((await api.replies(cast)).items,[reply]);assert.deepEqual((await api.reactions(cast,'likes')).items,[37]);
});
test('caller cancellation aborts the in-flight gateway request',async()=>{
  const signal=new AbortController();
  const api=createApi('https://kite.example',async(_input,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}));
  const request=api.publicFeed('',signal.signal);signal.abort();await assert.rejects(request,/aborted/);
});
