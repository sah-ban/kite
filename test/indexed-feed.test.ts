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
  const middleware=indexedFeed({DATABASE_URL:'configured',KITE_FEED_FIDS:'268438'},{pool:{query:async(sql:string)=>{if(sql==='SELECT fid FROM kite_feed_users WHERE fid=$1')return {rows:[]};throw new Error('private database URL');}}});
  async function call(path:string,method='GET'){let status=200;let body:any;await middleware({url:path,method},{setHeader(){},set statusCode(value:number){status=value;},end(value:string){body=JSON.parse(value);}},()=>{throw Error('Unexpected next');});return {status,body};}
  assert.equal((await call('/api/feed/following?fid=37')).status,404);
  assert.equal((await call('/api/feed/following?fid=268438','POST')).status,405);
  assert.equal((await call('/api/feed/following?fid=268438&mode=include')).status,400);
  const error=await call('/api/feed/following?fid=268438');assert.equal(error.status,503);assert.ok(!JSON.stringify(error).includes('private database'));
});

test('public feed API needs no viewer FID or enrollment and validates filters',async()=>{
  const calls:string[]=[];
  const pool={query:async(sql:string)=>{
    calls.push(sql);
    if(sql.includes('kite_feed_users')||sql.includes('kite_feed_follows'))throw Error('Public reads must not use viewer enrollment');
    if(sql.includes('max(id)'))return {rows:[{id:'1'}]};
    if(sql.includes('SELECT c.payload'))return {rows:[{payload:cast(1,30),timestamp:1000,hash:hash(1)}]};
    return {rows:[]};
  }};
  const middleware=indexedFeed({DATABASE_URL:'configured'},{pool});
  async function call(path:string,method='GET'){let status=200,body:any;await middleware({url:path,method},{setHeader(){},set statusCode(value:number){status=value;},end(value:string){body=JSON.parse(value);}},()=>{throw Error('Unexpected next');});return {status,body};}
  const response=await call('/api/feed/public');assert.equal(response.status,200);assert.equal(response.body.messages[0].data.fid,30);assert.equal(response.body.status.initializing,false);
  assert.ok(calls.every(sql=>!sql.includes('INSERT')&&!sql.includes('UPDATE')));
  assert.equal((await call('/api/feed/public','POST')).status,405);
  assert.equal((await call('/api/feed/public?mode=include')).status,400);
  assert.equal((await call('/api/feed/public?keys=invalid')).status,400);
});

test('PostgreSQL public feed: all authors, no replies, quotes and channels, stable pagination and filters',{skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
  const schema='public_feed_test_'+randomBytes(6).toString('hex');
  const admin=createPool(process.env.KITE_TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const db=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  const publicQuery=(extra='')=>({...parseFeedQuery(new URLSearchParams(extra)),fid:0,scope:'public'});
  try{
    await migrate(db);await replaceFollows(db,268438,[10]);
    for(let n=1;n<=65;n++){
      const message:any=cast(n,[10,20,30][n%3]);
      if(n===64)message.data.castAddBody.embeds=[{castId:{fid:10,hash:hash(1)}}];
      if(n===63)message.data.castAddBody.parentUrl='https://example.com/channel';
      await saveCast(db,message);
    }
    const reply:any=cast(66,30,2000);reply.data.castAddBody.parentCastId={fid:10,hash:hash(1)};await saveCast(db,reply);
    await db.query('INSERT INTO kite_feed_signers(author_fid,signer,requester_fid) VALUES(10,$1,9152),(20,$2,20)',[key(10),key(20)]);
    await deleteCast(db,hash(65),30);
    const first=await queryFeed(db,publicQuery());assert.equal(first.messages.length,30);assert.equal(first.messages[0].hash,hash(64));assert.equal(first.status.initializing,false);
    const inserted=cast(999,30,1500);await saveCast(db,inserted);
    const second=await queryFeed(db,publicQuery(),first.nextPageToken);
    const third=await queryFeed(db,publicQuery(),second.nextPageToken);
    const messages=[...first.messages,...second.messages,...third.messages] as Cast[];
    assert.equal(messages.length,64);assert.equal(new Set(messages.map(c=>c.hash)).size,64);
    assert.ok(messages.every(c=>!c.data.castAddBody.parentCastId));
    assert.ok(messages.find(c=>c.hash===hash(64))?.data.castAddBody.embeds?.some(embed=>embed.castId));
    assert.equal(messages.find(c=>c.hash===hash(63))?.data.castAddBody.parentUrl,'https://example.com/channel');
    assert.deepEqual([...new Set(messages.map(c=>c.data.fid))].sort(),[10,20,30]);
    assert.ok(!messages.some(c=>c.hash===hash(65)||c.hash===inserted.hash));
    assert.ok((await queryFeed(db,publicQuery())).messages.some((c:Cast)=>c.hash===inserted.hash));
    assert.ok((await queryFeed(db,publicQuery('mode=include&clients=9152'))).messages.every((c:Cast)=>c.data.fid===10));
    assert.ok((await queryFeed(db,publicQuery('mode=include&self=true'))).messages.every((c:Cast)=>c.data.fid===20));
    assert.ok((await queryFeed(db,publicQuery('mode=include&keys='+key(30)))).messages.every((c:Cast)=>c.data.fid===30));
    assert.ok((await queryFeed(db,publicQuery('mode=exclude&clients=9152'))).messages.every((c:Cast)=>c.data.fid!==10));
    assert.equal((await queryFeed(db,publicQuery('order=oldest'))).messages[0].hash,hash(1));
    await assert.rejects(queryFeed(db,query(),first.nextPageToken),/cursor/);
    await assert.rejects(queryFeed(db,publicQuery('order=oldest'),first.nextPageToken),/cursor/);
    await replaceFollows(db,268438,[]);assert.equal((await queryFeed(db,query())).messages.length,0);
    assert.equal((await queryFeed(db,publicQuery())).messages.length,30);
    const middleware=indexedFeed({DATABASE_URL:'configured'},{pool:db});let result:any;
    await middleware({url:'/api/feed/public',method:'GET'},{setHeader(){},end(value:string){result=JSON.parse(value);}},()=>{throw Error('Unexpected next');});
    assert.equal(result.messages.length,30);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('PostgreSQL feed: stable pages, filters before pagination, deletion races, channels, follow changes', {skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
  const schema='feed_test_'+randomBytes(6).toString('hex');
  const admin=createPool(process.env.KITE_TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const db=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  try{
    await migrate(db);await replaceFollows(db,268438,[10,20]);
    for(let n=1;n<=70;n++)await saveCast(db,cast(n,n%2?10:20));
    await db.query('INSERT INTO kite_feed_signers(author_fid,signer,requester_fid) VALUES(10,$1,9152),(20,$2,20)',[key(10),key(20)]);
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
    assert.equal((await db.query('SELECT deleted FROM kite_feed_casts WHERE hash=$1',[hash(70)])).rows[0].deleted,true);
    const channel:any=cast(1001,10,2000);channel.data.castAddBody.parentUrl='https://example.com/channel';await saveCast(db,channel);
    const reply:any=cast(1002,10,2001);reply.data.castAddBody.parentCastId={fid:37,hash:hash(123)};await saveCast(db,reply);
    assert.equal((await queryFeed(db,query())).messages[0].hash,channel.hash);
    await replaceFollows(db,268438,[10]);await assert.rejects(queryFeed(db,query(),first.nextPageToken),/Refresh/);
    assert.ok((await queryFeed(db,query())).messages.every((c:Cast)=>c.data.fid===10));
    await replaceFollows(db,268438,[]);assert.equal((await queryFeed(db,query())).messages.length,0);
  }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
