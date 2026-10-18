import test from 'node:test';
import assert from 'node:assert/strict';
import { readActivity, readConnections, followsAccount, readReactions, readReplies, mergePage, countLabel } from '../src/lib/social';
import { clientRoute } from '../src/lib/routes';
import type { Cast, Config } from '../src/lib/hub';

const config:Config={readUrl:'https://social.example',validatorUrl:'',optimismRpcUrl:'https://rpc.example'};
const hash='0x'+'ab'.repeat(20);
const cast:Cast={hash,signer:'0x'+'11'.repeat(32),data:{fid:37,timestamp:100,castAddBody:{text:'parent',mentions:[],mentionsPositions:[],embeds:[]}}};
Object.defineProperty(globalThis,'window',{value:{location:{hostname:'test.example'}},configurable:true});
function reaction(fid:number,type:string|number='MESSAGE_TYPE_REACTION_ADD',kind:string|number='REACTION_TYPE_LIKE',target=hash){return {hash:String(fid),data:{fid,timestamp:100,type,reactionBody:{type:kind,targetCastId:{fid:37,hash:target}}}};}

test('reply paging uses the documented parent identifier and excludes tombstones and unrelated casts',async()=>{
  const original=globalThis.fetch;let request='';
  const reply={...cast,hash:'0x'+'cd'.repeat(20),data:{...cast.data,castAddBody:{...cast.data.castAddBody,parentCastId:{fid:37,hash}}}};
  globalThis.fetch=async input=>{request=String(input);return Response.json({messages:[reply,reply,cast,{hash:'removed',data:{castRemoveBody:{}}}],nextPageToken:'next+/='});};
  try {
    const result=await readReplies(config,cast,'opaque+/=');const url=new URL(request);
    assert.equal(url.pathname,'/v1/castsByParent');assert.equal(url.searchParams.get('fid'),'37');assert.equal(url.searchParams.get('hash'),hash);assert.equal(url.searchParams.get('pageToken'),'opaque+/=');
    assert.deepEqual(result.items,[reply]);assert.equal(result.next,'next+/=');assert.equal(countLabel(result),'1+');
  }finally{globalThis.fetch=original;}
});
test('reaction counts use distinct active accounts for the exact cast and requested reaction',async()=>{
  const original=globalThis.fetch;let request='';
  globalThis.fetch=async input=>{request=String(input);return Response.json({messages:[reaction(1),reaction(1),reaction(2,3,1),reaction(3,'MESSAGE_TYPE_REACTION_REMOVE'),reaction(4,3,2),reaction(5,3,1,'0x'+'ee'.repeat(20))],nextPageToken:''});};
  try {
    const result=await readReactions(config,cast,'likes');const url=new URL(request);
    assert.equal(url.searchParams.get('target_fid'),'37');assert.equal(url.searchParams.get('target_hash'),hash);assert.equal(url.searchParams.get('reaction_type'),'Like');
    assert.deepEqual(result.items.map(m=>m.data.fid),[1,2]);assert.equal(countLabel(result),'2');
    await readReactions(config,cast,'recasts','cursor+/=');const recastURL=new URL(request);
    assert.equal(recastURL.searchParams.get('reaction_type'),'Recast');assert.equal(recastURL.searchParams.get('pageToken'),'cursor+/=');
  }finally{globalThis.fetch=original;}
});
test('page merging deduplicates records and preserves continuation and lower-bound counts',()=>{
  const page=mergePage({items:[1,2],next:'a'},{items:[2,3],next:'b'},n=>n);
  assert.deepEqual(page,{items:[1,2,3],next:'b'});assert.equal(countLabel(page),'3+');
  assert.equal(countLabel(mergePage(page,{items:[3,4],next:''},n=>n)),'4');assert.equal(countLabel(undefined),'—');
});
test('follower and following lists use opposite sides of active follow links',async()=>{
  const original=globalThis.fetch;let request='';
  globalThis.fetch=async input=>{request=String(input);return Response.json({messages:[{data:{fid:10,type:5,linkBody:{type:'follow',targetFid:37}}},{data:{fid:11,type:6,linkBody:{type:'follow',targetFid:37}}},{data:{fid:10,type:5,linkBody:{type:'follow',targetFid:37}}}],nextPageToken:'more'});};
  try {
    assert.deepEqual(await readConnections(config,37,'followers'),{items:[10],next:'more'});
    assert.equal(new URL(request).pathname,'/v1/linksByTargetFid');assert.equal(new URL(request).searchParams.get('target_fid'),'37');
    assert.deepEqual((await readConnections(config,10,'following')).items,[37]);assert.equal(new URL(request).pathname,'/v1/linksByFid');assert.equal(new URL(request).searchParams.get('fid'),'10');
  }finally{globalThis.fetch=original;}
});
test('failed counts stay unavailable while other activity remains usable and refresh can retry',async()=>{
  const original=globalThis.fetch;let fail=true;
  globalThis.fetch=async input=>String(input).includes('reaction_type=Like')&&fail?new Response('offline',{status:503}):Response.json({messages:[]});
  try {
    const result=await readActivity(config,cast,101);assert.equal(result.likes,undefined);assert.ok(result.errors.likes);assert.equal(countLabel(result.likes),'—');assert.equal(countLabel(result.replies),'0');
    fail=false;assert.equal(countLabel((await readActivity(config,cast,102)).likes),'0');
  }finally{globalThis.fetch=original;}
});
test('visible casts share cached counts and keep request concurrency bounded', {timeout:5000},async()=>{
  const original=globalThis.fetch;let running=0,max=0,calls=0,finished=0;const release:(()=>void)[]=[];
  globalThis.fetch=async()=>{calls++;running++;max=Math.max(max,running);await new Promise<void>(resolve=>release.push(resolve));running--;finished++;return Response.json({messages:[]});};
  try {
    const a=readActivity(config,cast,200),again=readActivity(config,cast,200),b=readActivity(config,{...cast,hash:'0x'+'ef'.repeat(20)},200);
    assert.equal(a,again);
    while(finished<6){release.shift()?.();await new Promise<void>(resolve=>setImmediate(resolve));}
    await Promise.all([a,again,b]);assert.equal(calls,6);assert.ok(max<=3);assert.equal(max,3);
  }finally{globalThis.fetch=original;}
});
test('client routes support home, public profiles, and shareable cast activity tabs',()=>{
  assert.deepEqual(clientRoute('/'),{kind:'home'});assert.deepEqual(clientRoute('/profile/37'),{kind:'profile',fid:37});assert.deepEqual(clientRoute('/following'),{kind:'following'});
  assert.deepEqual(clientRoute(`/cast/37/${hash}`,'?tab=likes'),{kind:'cast',fid:37,hash,tab:'likes'});
  assert.deepEqual(clientRoute('/profile/0'),{kind:'home'});assert.deepEqual(clientRoute('/cast/37/0xshort'),{kind:'home'});
});

test('profile connection routes preserve FID and list type without changing the following feed route',()=>{
  assert.deepEqual(clientRoute('/profile/37/followers'),{kind:'connections',fid:37,tab:'followers'});
  assert.deepEqual(clientRoute('/profile/37/following/'),{kind:'connections',fid:37,tab:'following'});
  assert.deepEqual(clientRoute('/following'),{kind:'following'});
  for(const path of ['/profile/0/followers','/profile/9007199254740992/following','/profile/37/unknown'])assert.deepEqual(clientRoute(path),{kind:'home'});
});


test('follows you checks the viewed profile as source and connected account as target',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));
    assert.equal(url.pathname,'/v1/linkById');assert.equal(url.searchParams.get('fid'),'37');assert.equal(url.searchParams.get('target_fid'),'4242');assert.equal(url.searchParams.get('link_type'),'follow');
    return Response.json({data:{fid:37,type:5,linkBody:{type:'follow',targetFid:4242}}});
  };
  try {
    assert.equal(await followsAccount(config,37,4242),true);
    assert.equal(await followsAccount(config,37,37),false);
    assert.equal(await followsAccount(config,37,0),false);
    assert.equal(calls,1);
    for(const data of [{fid:4242,type:5,linkBody:{type:'follow',targetFid:37}},{fid:37,type:6,linkBody:{type:'follow',targetFid:4242}},{fid:37,type:5,linkBody:{type:'other',targetFid:4242}}]){
      globalThis.fetch=async()=>Response.json({data});assert.equal(await followsAccount(config,37,4242),false);
    }
  }finally{globalThis.fetch=original;}
});

test('missing follow links are false while node failures and cancellation remain errors',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('not found',{status:404});
    assert.equal(await followsAccount(config,37,4242),false);
    globalThis.fetch=async()=>new Response('unavailable',{status:503});
    await assert.rejects(followsAccount(config,37,4242),/503/);
    const controller=new AbortController();controller.abort();
    globalThis.fetch=async(_input,init)=>{assert.equal(init?.signal,controller.signal);throw init.signal.reason;};
    await assert.rejects(followsAccount(config,37,4242,controller.signal),{name:'AbortError'});
  }finally{globalThis.fetch=original;}
});

test('settings has a direct route and supports trailing slashes',()=>{
  assert.deepEqual(clientRoute('/settings'),{kind:'settings'});
  assert.deepEqual(clientRoute('/settings/'),{kind:'settings'});
});
