import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
// @ts-expect-error Server module.
import {createPushDelivery,pushMessage,registerPush} from '../feed/push.mjs';
// @ts-expect-error Server module.
import {createPool,migrate,enrollViewer} from '../feed/store.mjs';
// @ts-expect-error Server module.
import {indexNotification} from '../feed/notifications.mjs';
const token='ExpoPushToken[fixture_token_123]';
const row={id:'1',notification_id:'22',installation_id:'a'.repeat(32),generation:'1',attempts:0,token,viewer_fid:'37',actor_fid:'38',kind:'like',target_fid:'37',target_hash:'0x'+'12'.repeat(20)};
function queue({pending=[row],receipts=[] as any[]}={}){
 const calls:{sql:string;params:any[]}[]=[];
 return {calls,query:async(sql:string,params:any[]=[])=>{calls.push({sql,params});return {rows:sql.startsWith('SELECT j.*,d.token')?pending:sql.startsWith('SELECT j.* FROM')?receipts:sql.startsWith('SELECT 1 FROM kite_push_devices')?[{}]:[]};}};
}
test('push payloads use validated local activity data and generic lock-screen text for every activity kind',()=>{
 for(const kind of ['mention','reply','like','recast','follow']){
  const message=pushMessage({...row,kind});assert.equal(message.to,token);assert.equal(message.channelId,'activity');assert.equal(message.data.viewerFid,37);assert.equal(message.data.actor,38);assert.equal(message.data.type,'kite.activity');assert.ok(message.title);assert.ok(message.body);assert.ok(!JSON.stringify(message).includes('privateKey'));
 }
});
test('accepted push tickets are persisted for receipt checks without marking them delivered',async()=>{
 const pool=queue();let sent:any;
 await createPushDelivery(pool,{accessToken:'fixture-access',fetcher:async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://exp.host/--/api/v2/push/send');assert.equal((init.headers as any).Authorization,'Bearer fixture-access');sent=JSON.parse(String(init.body));return Response.json({data:[{status:'ok',id:'ticket-one'}]});
 }})();
 assert.equal(sent[0].data.notificationId,'22');assert.ok(pool.calls.some(call=>call.sql.includes('SET ticket=')&&call.params[1]==='ticket-one'));
 assert.ok(!pool.calls.some(call=>call.sql.startsWith('UPDATE kite_push_jobs SET finished_at')));
});
test('invalid devices are disabled from both immediate tickets and later receipts',async()=>{
 for(const receipt of [false,true]){
  const pool=queue({pending:receipt?[]:[row],receipts:receipt?[{...row,ticket:'ticket-one'}]:[]});
  await createPushDelivery(pool,{fetcher:async()=>Response.json({data:receipt?{'ticket-one':{status:'error',details:{error:'DeviceNotRegistered'}}}:[{status:'error',details:{error:'DeviceNotRegistered'}}]})})();
  assert.ok(pool.calls.some(call=>call.sql.startsWith('UPDATE kite_push_devices SET enabled=false')&&call.params[0]===row.installation_id));
  assert.ok(pool.calls.some(call=>call.sql.startsWith('UPDATE kite_push_jobs SET finished_at')));
 }
});
test('temporary provider failures schedule bounded retries without dropping activity',async()=>{
 for(const response of [Response.json({},{status:503}),Response.json({data:[{status:'error',details:{error:'MessageRateExceeded'}}]})]){
  const pool=queue();await createPushDelivery(pool,{fetcher:async()=>response,log:()=>{}})();
  const retry=pool.calls.find(call=>call.sql.includes('attempts=attempts+1'));assert.ok(retry);assert.equal(retry.params[1],30);
  assert.ok(!pool.calls.some(call=>call.sql.startsWith('UPDATE kite_push_devices')));
 }
});
test('PostgreSQL push outbox is transactional, deduplicated, skips history and isolates device account generations',{skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
 const schema='push_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.KITE_TEST_DATABASE_URL);
 await admin.query(`CREATE SCHEMA ${schema}`);const pool=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
 const fid=37,key='0x'+'11'.repeat(32),registration={installationId:row.installation_id,token,enabled:true};
 const timestamp=Math.floor(Date.now()/1000)-1609459200;
 const cast=(n:number,time=Math.floor(Date.now()/1000)-1609459200)=>({hash:'0x'+n.toString(16).padStart(40,'0'),signer:key,data:{fid:38,type:1,timestamp:time,castAddBody:{text:'fixture',mentions:[37],mentionsPositions:[0],embeds:[]}}});
 const count=async()=>Number((await pool.query('SELECT count(*) FROM kite_push_jobs')).rows[0].count);
 try{
  await migrate(pool);await enrollViewer(pool,37);await enrollViewer(pool,39);await pool.query("UPDATE kite_feed_users SET notifications_started_at=now()-interval '1 day'");
  const viewers=new Map([[37,timestamp-86400]]);
  await indexNotification(pool,cast(1,timestamp-5),viewers);assert.equal(await count(),0);
  await registerPush(pool,fid,key,registration);await indexNotification(pool,cast(2,timestamp-2),viewers);assert.equal(await count(),0,'no historical pushes at registration');
  const live=cast(3);await indexNotification(pool,live,viewers);await indexNotification(pool,live,viewers);assert.equal(await count(),1);
  const db=await pool.connect();try{await db.query('BEGIN');await indexNotification(db,cast(4),viewers);await db.query('ROLLBACK');}finally{db.release();}assert.equal(await count(),1,'queue follows stream rollback');
  await registerPush(pool,fid,key,registration);assert.equal(await count(),1,'an idempotent refresh retains pending pushes');
  await registerPush(pool,fid,key,{...registration,enabled:false});assert.equal(await count(),0);await indexNotification(pool,cast(5),viewers);assert.equal(await count(),0);
  await registerPush(pool,fid,key,registration);await indexNotification(pool,cast(6),viewers);assert.equal(await count(),1);
  await registerPush(pool,39,key,registration);assert.equal(await count(),0,'account switch discards the previous account queue');
  await registerPush(pool,fid,key,{...registration,enabled:false});assert.equal((await pool.query('SELECT enabled FROM kite_push_devices')).rows[0].enabled,true,'old account cannot disable the new account');
  await registerPush(pool,fid,key,{...registration,installationId:'b'.repeat(32)});assert.equal((await pool.query('SELECT count(*) FROM kite_push_devices')).rows[0].count,'1','one token cannot produce duplicate device alerts');
  const currentRegistration={...registration,installationId:'b'.repeat(32)};
  await indexNotification(pool,cast(7),viewers);assert.equal(await count(),1);
  await registerPush(pool,fid,key,{...currentRegistration,token:'ExpoPushToken[rotated_token_123]'});assert.equal(await count(),0,'token rotation invalidates queued sends');
  const removed=cast(8);await indexNotification(pool,removed,viewers);await indexNotification(pool,removed,viewers,true);
  await createPushDelivery(pool,{fetcher:async()=>{throw Error('Removed activity must not send');}})();assert.equal(await count(),0);
  await indexNotification(pool,cast(9),viewers);
  const send=createPushDelivery(pool,{fetcher:async(url:string,init:RequestInit)=>{
    if(url.endsWith('/send')){assert.equal(JSON.parse(String(init.body))[0].to,'ExpoPushToken[rotated_token_123]');return Response.json({data:[{status:'ok',id:'integration-ticket'}]});}
    return Response.json({data:{'integration-ticket':{status:'error',details:{error:'DeviceNotRegistered'}}}});
  }});
  await send();assert.equal((await pool.query('SELECT ticket FROM kite_push_jobs')).rows[0].ticket,'integration-ticket');
  await pool.query('UPDATE kite_push_jobs SET next_attempt_at=now()');await send();
  assert.equal((await pool.query('SELECT enabled FROM kite_push_devices')).rows[0].enabled,false);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
