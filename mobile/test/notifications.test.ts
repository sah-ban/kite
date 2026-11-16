import test from 'node:test';
import assert from 'node:assert/strict';
import {readNotifications,hasMoreNotifications,mergeNotifications} from '../src/lib/notifications';
import type {Cast} from '../src/lib/model';
import {createApi} from '../src/lib/api';
const config=createApi('https://kite.example',(input,init)=>fetch(input,init));
const hash=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const cast=(fid:number,timestamp:number,parent?:{fid:number;hash:string},mentions:number[]=[]):Cast=>({hash:hash(fid),signer:'0x'+'11'.repeat(32),data:{fid,timestamp,castAddBody:{text:`Cast ${fid}`,mentions,mentionsPositions:mentions.map(()=>0),embeds:[],...(parent?{parentCastId:parent}:{})}}});
const own=cast(37,10),parent={fid:37,hash:own.hash};
const reaction=(fid:number,timestamp:number,type=1,messageType=3,target=parent)=>({data:{fid,timestamp,type:messageType,reactionBody:{type,targetCastId:target}}});
const follower=(fid:number,type=5,target=37)=>({data:{fid,timestamp:100,type,linkBody:{type:'follow',targetFid:target}}});

test('notifications merge mentions, replies, likes, recasts and followers, excluding self and unrelated activity',async()=>{
 const original=globalThis.fetch;const calls:URL[]=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input),'https://client.example');calls.push(u);const ep=u.pathname.split('/').pop();
  if(ep==='castsByFid')return Response.json({messages:[own]});
  if(ep==='castsByMention')return Response.json({messages:[cast(51,500,undefined,[37]),cast(52,400,parent,[37]),cast(37,999,undefined,[37]),cast(99,900)]});
  if(ep==='linksByTargetFid')return Response.json({messages:[follower(55),follower(37),follower(56,6),follower(57,5,99)]});
  if(ep==='castsByParent')return Response.json({messages:[cast(52,400,parent,[37]),cast(37,888,parent),cast(58,777,{fid:37,hash:hash(99)})]});
  if(ep==='reactionsByCast')return Response.json({messages:[reaction(53,300),reaction(53,300),reaction(54,200,2),reaction(37,999),reaction(59,999,1,4),reaction(60,999,1,3,{fid:99,hash:hash(99)})]});
  throw new Error('Unexpected endpoint');
 };
 try{
  const page=await readNotifications(config,37);
  assert.deepEqual(page.items.map(n=>[n.kind,n.actor]),[['mention',51],['reply',52],['like',53],['recast',54],['follow',55]]);
  assert.equal(page.cursor.scanned,1);assert.equal(hasMoreNotifications(page.cursor),false);assert.deepEqual(page.errors,[]);
  assert.ok(calls.every(u=>u.searchParams.get('reverse')==='true'));
  assert.equal(calls.find(u=>u.pathname.endsWith('reactionsByCast'))?.searchParams.get('target_fid'),'37');
  assert.equal(calls.find(u=>u.pathname.endsWith('castsByParent'))?.searchParams.get('hash'),own.hash);
 }finally{globalThis.fetch=original;}
});

test('notification cursors preserve opaque tokens across mentions, followers, casts and per-cast activity',async()=>{
 const original=globalThis.fetch,calls:URL[]=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input),'https://client.example');calls.push(u);const ep=u.pathname.split('/').pop();
  if(!u.searchParams.has('pageToken'))return Response.json({messages:ep==='castsByFid'?[own]:[],nextPageToken:ep+'+/='});
  return Response.json({messages:ep==='castsByMention'?[cast(61,600,undefined,[37])]:ep==='reactionsByCast'?[reaction(62,650)]:[]});
 };
 try{
  const first=await readNotifications(config,37);assert.equal(hasMoreNotifications(first.cursor),true);assert.equal(first.cursor.activity.length,2);
  const second=await readNotifications(config,37,first.cursor);assert.deepEqual(second.items.map(n=>n.kind),['like','mention']);assert.equal(hasMoreNotifications(second.cursor),false);
  for(const ep of ['castsByMention','linksByTargetFid','castsByFid','castsByParent','reactionsByCast'])assert.ok(calls.some(u=>u.pathname.endsWith(ep)&&u.searchParams.get('pageToken')===ep+'+/='));
 }finally{globalThis.fetch=original;}
});

test('partial failures preserve successful activity and retry only failed work',async()=>{
 const original=globalThis.fetch;let fail=true;const calls:URL[]=[];
 globalThis.fetch=async input=>{
  const u=new URL(String(input),'https://client.example');calls.push(u);const ep=u.pathname.split('/').pop();
  if(ep==='castsByFid')return Response.json({messages:[own]});
  if(ep==='castsByMention')return fail?new Response('offline',{status:503}):Response.json({messages:[cast(63,700,undefined,[37])]});
  if(ep==='reactionsByCast')return fail?new Response('offline',{status:503}):Response.json({messages:[reaction(64,800)]});
  return Response.json({messages:ep==='linksByTargetFid'?[follower(65)]:[]});
 };
 try{
  const first=await readNotifications(config,37);assert.deepEqual(first.items.map(n=>n.kind),['follow']);assert.deepEqual(new Set(first.errors),new Set(['Mentions','Likes and recasts']));assert.equal(first.cursor.activity.length,1);
  fail=false;const before=calls.length;const second=await readNotifications(config,37,first.cursor);
  assert.deepEqual(second.errors,[]);assert.deepEqual(calls.slice(before).map(u=>u.pathname.split('/').pop()).sort(),['castsByMention','reactionsByCast']);
  assert.deepEqual(mergeNotifications(first.items,second.items).map(n=>n.kind),['like','mention','follow']);
 }finally{globalThis.fetch=original;}
});

test('notification fanout is bounded and cancelled reads stop before further activity batches',async()=>{
 const original=globalThis.fetch;let active=0,max=0;
 globalThis.fetch=async input=>{
  active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;
  return Response.json({messages:String(input).includes('castsByFid')?Array.from({length:10},(_,i)=>({...own,hash:hash(i+100)})):[]});
 };
 try{
  const page=await readNotifications(config,37);assert.equal(page.cursor.scanned,10);assert.ok(max<=4);
  const controller=new AbortController();controller.abort();globalThis.fetch=async(_input,init)=>{throw init?.signal?.reason;};
  await assert.rejects(readNotifications(config,37,undefined,controller.signal),{name:'AbortError'});
  await assert.rejects(readNotifications(config,0),/Connect an account/);
 }finally{globalThis.fetch=original;}
});

test('a reply mentioned twice appears once',()=>{
 const c=cast(52,400,parent,[37]);const base={id:'cast:52:'+c.hash,actor:52,timestamp:400,cast:c};
 assert.deepEqual(mergeNotifications([{...base,kind:'mention'}],[{...base,kind:'reply'}]).map(n=>n.kind),['reply']);
});

test('indexed notifications retain filter, unread marker and opaque pagination on the configured gateway',async()=>{
 const {indexedNotifications}=await import('../src/lib/notifications');
 const calls:URL[]=[];const api=createApi('https://kite.example',async input=>{calls.push(new URL(String(input)));return Response.json({items:[],nextPageToken:'opaque+/=',unread:3,serverTime:'2026-11-16T12:00:00.000Z',startedAt:null,workerOnline:false,historyDays:30});});
 const page=await indexedNotifications(api,37,{kind:'like',since:'2026-11-16T10:00:00.000Z'});
 await indexedNotifications(api,37,{kind:'like',cursor:page.nextPageToken,summary:true});
 assert.equal(calls[0].origin,'https://kite.example');assert.equal(calls[0].pathname,'/api/feed/notifications');assert.equal(calls[0].searchParams.get('kind'),'like');assert.equal(calls[0].searchParams.get('fid'),'37');assert.equal(calls[0].searchParams.get('since'),'2026-11-16T10:00:00.000Z');
 assert.equal(calls[1].searchParams.get('cursor'),'opaque+/=');assert.equal(calls[1].searchParams.get('summary'),'true');assert.equal(page.unread,3);
});
