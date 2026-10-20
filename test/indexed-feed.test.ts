import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
// @ts-expect-error Server-only feed modules.
import {createPool,migrate,replaceFollows,saveCast,deleteCast,parseFeedQuery,queryFeed} from '../feed/store.mjs';
// @ts-expect-error Server-only API.
import {indexedFeed} from '../feed/api.mjs';
// @ts-expect-error Shared event normalization.
import {castOf,subscriptionRequest,requesterOf} from '../feed/protocol.mjs';
import type {Cast} from '../src/lib/hub';
import {MessageData} from '@farcaster/core';
const hash=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const key=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const cast=(n:number,fid=10,timestamp=1000+Math.floor(n/2))=>({hash:hash(n),signer:key(fid),data:{fid,timestamp,castAddBody:{text:'Cast '+n,mentions:[],mentionsPositions:[],embeds:[]}}});
const query=(extra='')=>parseFeedQuery(new URLSearchParams('fid=268438'+extra));

test('indexed feed validates public filter input and explicitly subscribes to events',()=>{
  assert.throws(()=>query('&mode=include'));
  for(const extra of ['&clients=-1','&keys=secret','&order=random','&mode=bad','&clients=1.5'])assert.throws(()=>query(extra));
  assert.deepEqual(query('&clients=9152,9152,16823').fids,[9152,16823]);
  const request=subscriptionRequest(2,'123456');assert.equal(request[0],10);assert.ok(request[1]>0);assert.ok(request.includes(1));
  assert.equal(requesterOf({fid:10,source:2,requestFid:9152}),9152);
  assert.equal(requesterOf({source:2,requestFid:0}),undefined);
});
test('streamed casts normalize dataBytes, mentions, images, quotes and channel parents',()=>{
  const data=MessageData.create({fid:10,type:1,timestamp:123,castAddBody:{text:'hello',mentions:[37],mentionsPositions:[0],embeds:[{url:'https://example.com/image.png'},{castId:{fid:37,hash:Buffer.from(hash(2).slice(2),'hex')}}],parentUrl:'https://example.com/channel'}});
  const result=castOf({hash:Buffer.from(hash(1).slice(2),'hex'),signer:Buffer.from(key(10).slice(2),'hex'),dataBytes:MessageData.encode(data).finish()});
  assert.equal(result.hash,hash(1));assert.equal(result.signer,key(10));assert.equal(result.data.castAddBody.embeds[1].castId.hash,hash(2));assert.deepEqual(result.data.castAddBody.mentions,[37]);assert.equal(result.data.castAddBody.parentUrl,'https://example.com/channel');
});
test('feed API rejects unsupported FIDs/methods and hides database details',async()=>{
  const middleware=indexedFeed({DATABASE_URL:'configured',FREECAST_FEED_FIDS:'268438'},{pool:{query:async()=>{throw new Error('private database URL');}}});
  async function call(path:string,method='GET'){let status=200;let body:any;await middleware({url:path,method},{setHeader(){},set statusCode(value:number){status=value;},end(value:string){body=JSON.parse(value);}},()=>{throw Error('Unexpected next');});return {status,body};}
  assert.equal((await call('/api/feed/following?fid=37')).status,404);
  assert.equal((await call('/api/feed/following?fid=268438','POST')).status,405);
  assert.equal((await call('/api/feed/following?fid=268438&mode=include')).status,400);
  const error=await call('/api/feed/following?fid=268438');assert.equal(error.status,503);assert.ok(!JSON.stringify(error).includes('private database'));
});

test('PostgreSQL feed: stable pages, filters before pagination, deletion races, channels, follow changes', {skip:!process.env.FREECAST_TEST_DATABASE_URL},async()=>{
  const schema='feed_test_'+randomBytes(6).toString('hex');
  const admin=createPool(process.env.FREECAST_TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const db=createPool(process.env.FREECAST_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  try{
    await migrate(db);await replaceFollows(db,268438,[10,20]);
    for(let n=1;n<=70;n++)await saveCast(db,cast(n,n%2?10:20));
    await db.query('INSERT INTO freecast_feed_signers(author_fid,signer,requester_fid) VALUES(10,$1,9152),(20,$2,20)',[key(10),key(20)]);
    const first=await queryFeed(db,query());assert.equal(first.messages.length,30);assert.ok(first.nextPageToken);
    const fresh=cast(999,10,1020);await saveCast(db,fresh);
    const second=await queryFeed(db,query(),first.nextPageToken);assert.equal(second.messages.length,30);
    const third=await queryFeed(db,query(),second.nextPageToken);assert.equal(third.messages.length,10);
    const hashes=[...first.messages,...second.messages,...third.messages].map((c:Cast)=>c.hash);assert.equal(new Set(hashes).size,70);assert.ok(!hashes.includes(fresh.hash));
    const refreshed=await queryFeed(db,query());assert.ok(refreshed.messages.some((c:Cast)=>c.hash===fresh.hash));
    assert.ok((await queryFeed(db,query('&mode=include&clients=9152'))).messages.every((c:Cast)=>c.data.fid===10));
    assert.ok((await queryFeed(db,query('&mode=include&self=true'))).messages.every((c:Cast)=>c.data.fid===20));
    assert.ok((await queryFeed(db,query('&mode=exclude&self=true'))).messages.every((c:Cast)=>c.data.fid===10));
    assert.equal((await queryFeed(db,query('&order=oldest'))).messages[0].hash,hash(1));
    await assert.rejects(queryFeed(db,query('&mode=include&clients=9152'),first.nextPageToken),/cursor/);
    await deleteCast(db,hash(70),20);await saveCast(db,cast(70,20),{backfill:true});await saveCast(db,cast(70,20));
    assert.equal((await db.query('SELECT deleted FROM freecast_feed_casts WHERE hash=$1',[hash(70)])).rows[0].deleted,true);
    const channel:any=cast(1001,10,2000);channel.data.castAddBody.parentUrl='https://example.com/channel';await saveCast(db,channel);
    const reply:any=cast(1002,10,2001);reply.data.castAddBody.parentCastId={fid:37,hash:hash(123)};await saveCast(db,reply);
    assert.equal((await queryFeed(db,query())).messages[0].hash,channel.hash);
    await replaceFollows(db,268438,[10]);await assert.rejects(queryFeed(db,query(),first.nextPageToken),/Refresh/);
    assert.ok((await queryFeed(db,query())).messages.every((c:Cast)=>c.data.fid===10));
    await replaceFollows(db,268438,[]);assert.equal((await queryFeed(db,query())).messages.length,0);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
