import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
// @ts-expect-error Server module.
import {createPool,migrate,enrollViewer} from '../feed/store.mjs';
// @ts-expect-error Server module.
import {indexNotification,queryNotifications} from '../feed/notifications.mjs';
// @ts-expect-error Server middleware.
import {indexedFeed} from '../feed/api.mjs';
import {MessageData} from '@farcaster/core';
const hash=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
const key='0x'+'11'.repeat(32);
const message=(n:number,fid:number,type:number,body:object,timestamp=200)=>({hash:hash(n),signer:key,data:{fid,type,timestamp,...body}});
const cast=(n:number,fid:number,body:object={},timestamp=200)=>message(n,fid,1,{castAddBody:{text:'Notification '+n,mentions:[],mentionsPositions:[],embeds:[],...body}},timestamp);
const params=(value='')=>new URLSearchParams(value);

test('notification candidates ignore self, unenrolled viewers and pre-activation history without a database call',async()=>{
 const db={query:()=>{throw Error('Unexpected notification write');}},viewers=new Map([[37,150]]);
 await indexNotification(db,cast(1,37,{mentions:[37]}),viewers);
 await indexNotification(db,cast(2,10,{mentions:[100]}),viewers);
 await indexNotification(db,cast(3,10,{mentions:[37]},149),viewers);
 await indexNotification(db,message(4,10,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(50)}}},149),viewers);
});
test('notification API requires existing enrollment and refuses writes',async()=>{
 const api=indexedFeed({DATABASE_URL:'configured'},{pool:{query:async()=>({rows:[]})}});
 async function call(path:string,method='GET'){let status=200,body:any;await api({url:path,method},{setHeader(){},set statusCode(code:number){status=code;},end(text:string){body=JSON.parse(text);}},()=>{throw Error('Unexpected next');});return {status,body};}
 assert.equal((await call('/api/feed/notifications?fid=37')).status,404);
 assert.equal((await call('/api/feed/notifications?fid=0')).status,400);
 assert.equal((await call('/api/feed/notifications?fid=37','POST')).status,405);
});

test('PostgreSQL live notifications: no history, all kinds, deduplication, removals, unread, pagination and rollback',{skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
 const schema='notifications_test_'+randomBytes(6).toString('hex');
 const admin=createPool(process.env.KITE_TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
 const db=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
 const viewers=new Map([[37,150],[38,150]]);
 try{
  await migrate(db);await enrollViewer(db,37);await enrollViewer(db,38);
  await db.query("UPDATE kite_feed_users SET notifications_started_at=to_timestamp(1609459350)");
  await db.query('INSERT INTO kite_feed_health(id,connected_shards) VALUES(1,ARRAY[1,2])');
  await indexNotification(db,cast(1,10,{mentions:[37]},149),viewers);
  assert.equal((await queryNotifications(db,37,params())).items.length,0);
  // Actors need not be followed. Mention + reply produces one reply for 37 and a mention for 38.
  const reply=cast(2,10,{mentions:[37,37,38],mentionsPositions:[0,0,0],parentCastId:{fid:37,hash:hash(999)}});
  await indexNotification(db,reply,viewers);await indexNotification(db,reply,viewers);
  let page=await queryNotifications(db,37,params());assert.equal(page.items.length,1);assert.equal(page.items[0].kind,'reply');assert.equal(page.unread,1);assert.equal(page.workerOnline,true);
  assert.equal((await queryNotifications(db,38,params())).items[0].kind,'mention');
  assert.equal((await queryNotifications(db,37,params('since='+encodeURIComponent(page.serverTime.toISOString())))).unread,0);
  // Raw protobuf/dataBytes, including target hash normalization.
  const reaction=message(3,11,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:Buffer.from(hash(999).slice(2),'hex')}}});
  const encoded=MessageData.encode(MessageData.create(reaction.data as any)).finish();
  await indexNotification(db,{hash:hash(3),dataBytes:encoded},viewers);
  await indexNotification(db,message(4,12,3,{reactionBody:{type:2,targetCastId:{fid:37,hash:hash(999)}}}),viewers);
  await indexNotification(db,message(5,13,5,{linkBody:{type:'follow',targetFid:37}}),viewers);
  await indexNotification(db,cast(6,14,{mentions:[37]}),viewers);
  await indexNotification(db,cast(7,37,{mentions:[37]}),viewers);
  page=await queryNotifications(db,37,params());assert.deepEqual(new Set(page.items.map((i:any)=>i.kind)),new Set(['reply','like','recast','follow','mention']));assert.equal(page.items.length,5);
  const like=(await queryNotifications(db,37,params('kind=like'))).items[0];assert.deepEqual(like.target,{fid:37,hash:hash(999)});assert.equal(like.cast,undefined);
  // Replace a follow, then an old revoke must not remove the replacement.
  await indexNotification(db,message(8,13,5,{linkBody:{type:'follow',targetFid:37}},201),viewers);
  await indexNotification(db,message(5,13,5,{linkBody:{type:'follow',targetFid:37}}),viewers,true);
  assert.equal((await queryNotifications(db,37,params('kind=follow'))).items.length,1);
  await indexNotification(db,message(9,13,6,{linkBody:{type:'follow',targetFid:37}},202),viewers);
  assert.equal((await queryNotifications(db,37,params('kind=follow'))).items.length,0);
  await indexNotification(db,message(10,11,4,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(999)}}},202),viewers);
  assert.equal((await queryNotifications(db,37,params('kind=like'))).items.length,0);
  // Pruning/revoking a reply removes both recipient notifications.
  await indexNotification(db,reply,viewers,true);
  assert.equal((await queryNotifications(db,38,params())).items.length,0);
  await indexNotification(db,message(11,37,2,{castRemoveBody:{targetHash:hash(999)}},203),viewers);
  assert.equal((await queryNotifications(db,37,params('kind=recast'))).items.length,0);
  // A late reaction to a deleted own cast must not resurrect activity.
  await indexNotification(db,message(12,15,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(999)}}},204),viewers);
  assert.equal((await queryNotifications(db,37,params('kind=like'))).items.length,0);
  await indexNotification(db,message(13,13,5,{linkBody:{type:'follow',targetFid:37}},205),viewers);
  await indexNotification(db,message(14,13,14,{linkCompactStateBody:{type:'follow',targetFids:[]}},206),viewers);
  assert.equal((await queryNotifications(db,37,params('kind=follow'))).items.length,0);
  for(let n=20;n<85;n++)await indexNotification(db,cast(n,100+n,{mentions:[37]}),viewers);
  const first=await queryNotifications(db,37,params());assert.equal(first.items.length,50);assert.ok(first.nextPageToken);
  await indexNotification(db,cast(100,500,{mentions:[37]}),viewers);
  const second=await queryNotifications(db,37,params('cursor='+first.nextPageToken));assert.equal(second.items.length,16);assert.equal(second.nextPageToken,'');
  assert.equal(new Set([...first.items,...second.items].map((item:any)=>item.id)).size,66);
  assert.ok(!second.items.some((item:any)=>item.actor===500));
  // Two shards can react to and delete the same target concurrently.
  const firstWriter=await db.connect(),secondWriter=await db.connect();
  try{
   await firstWriter.query('BEGIN');await secondWriter.query('BEGIN');
   await indexNotification(firstWriter,message(200,600,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(2000)}}},220),viewers);
   const deletion=indexNotification(secondWriter,message(201,37,2,{castRemoveBody:{targetHash:hash(2000)}},221),viewers);
   await firstWriter.query('COMMIT');await deletion;await secondWriter.query('COMMIT');
   assert.ok(!(await queryNotifications(db,37,params('kind=like'))).items.some((item:any)=>item.actor===600));
   await indexNotification(db,message(202,601,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(2000)}}},222),viewers);
   assert.ok(!(await queryNotifications(db,37,params('kind=like'))).items.some((item:any)=>item.actor===601));
  }finally{await firstWriter.query('ROLLBACK');await secondWriter.query('ROLLBACK');firstWriter.release();secondWriter.release();}
  // Pruning a viewer's cast also removes its reaction notifications.
  await indexNotification(db,message(203,602,3,{reactionBody:{type:1,targetCastId:{fid:37,hash:hash(2001)}}},223),viewers);
  await indexNotification(db,cast(2001,37),viewers,true);
  assert.ok(!(await queryNotifications(db,37,params('kind=like'))).items.some((item:any)=>item.actor===602));
  const connection=await db.connect();try{await connection.query('BEGIN');await indexNotification(connection,cast(101,501,{mentions:[37]}),viewers);await connection.query('ROLLBACK');}finally{connection.release();}
  assert.ok(!(await queryNotifications(db,37,params())).items.some((item:any)=>item.actor===501));
  assert.deepEqual((await queryNotifications(db,37,params('summary=true'))).items,[]);
  for(const query of ['kind=invalid','cursor=-1','cursor=9999999999999999999','since=bad','since=0'])await assert.rejects(queryNotifications(db,37,params(query)),/Invalid notification/);
 }finally{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
