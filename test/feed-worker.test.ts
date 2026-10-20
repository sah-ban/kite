import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Server,ServerCredentials} from '@grpc/grpc-js';
import {HubEvent,Message} from '@farcaster/core';
// @ts-expect-error Node worker.
import {startWorker} from '../feed/worker.mjs';
// @ts-expect-error Node storage.
import {createPool,migrate,replaceFollows,enrollViewer,saveCast} from '../feed/store.mjs';

const key='0x'+'11'.repeat(32),hash='0x'+'22'.repeat(20);
const add={hash,signer:key,data:{fid:10,type:1,timestamp:Math.floor(Date.now()/1000)-1609459200,network:1,castAddBody:{text:'Worker fixture',mentions:[],mentionsPositions:[],embeds:[]}}};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('worker integrates backfill, explicit subscriptions, atomic checkpoints, reconnect and cast removal', {skip:!process.env.FREECAST_TEST_DATABASE_URL},async()=>{
  const schema='worker_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.FREECAST_TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool(process.env.FREECAST_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  await migrate(pool);await replaceFollows(pool,268438,[10]);
  const ghost={...add,hash:'0x'+'99'.repeat(20)};await saveCast(pool,ghost);
  await pool.query("INSERT INTO freecast_feed_checkpoints(shard,event_id,updated_at) VALUES(1,50,now()-interval '3 days')");
  const server=new Server();let connections=0;let stop:(()=>Promise<void>)|undefined;let rpc:any;const timers:ReturnType<typeof setTimeout>[]=[];
  server.addService({subscribe:{path:'/HubService/Subscribe',requestStream:false,responseStream:true,requestDeserialize:(bytes:Buffer)=>bytes,requestSerialize:(bytes:Buffer)=>bytes,responseSerialize:(event:any)=>Buffer.from(HubEvent.encode(HubEvent.create(event)).finish()),responseDeserialize:HubEvent.decode}},
    {subscribe(call:any){connections++;rpc=call;assert.equal(call.request[0],10);assert.ok(call.request[1]>0);call.on('error',()=>{});
      timers.push(setTimeout(()=>call.write({type:1,id:101,mergeMessageBody:{message:Message.create({hash:Buffer.from(hash.slice(2),'hex'),signer:Buffer.from(key.slice(2),'hex'),data:add.data}),deletedMessages:[]}}),100));
      if(connections===1)timers.push(setTimeout(()=>call.end(),200));
    }});
  const port=await new Promise<number>((resolve,reject)=>server.bindAsync('127.0.0.1:0',ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
  async function until(check:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await check())return;await sleep(100);}throw Error('Worker fixture timed out');}
  const fetcher=async(url:URL)=>{
    const ep=url.pathname.split('/').pop();
    if(ep==='info')return Response.json({shardInfos:[{shardId:1}]});
    if(ep==='events')return Response.json({events:[{id:100}]});
    if(ep==='linksByFid'){const fid=Number(url.searchParams.get('fid'));if(fid===888)throw Error('Fixture follow graph failure');return Response.json({messages:(fid===999?[10,20]:[10]).map(targetFid=>({data:{type:5,linkBody:{targetFid}}}))});}
    if(ep==='signersByFid')return Response.json({signers:[{fid:10,key,keyType:1,source:2,requestFid:9152}]});
    if(ep==='onChainSignersByFid')return Response.json({events:[]});
    if(ep==='castsByFid'){const fid=Number(url.searchParams.get('fid'));return Response.json({messages:[fid===20?{...add,hash:'0x'+'55'.repeat(20),data:{...add.data,fid:20}}:add]});}
    throw Error('Unexpected endpoint '+ep);
  };
  try{
    stop=await startWorker({DATABASE_URL:'fixture',FREECAST_FEED_FIDS:'268438',FREECAST_FEED_GRPC_URL:'http://127.0.0.1:'+port},{pool,fetcher,log:()=>{}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM freecast_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===101);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_casts WHERE hash=$1',[hash])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_casts WHERE hash=$1',[ghost.hash])).rows[0].n,0);
    await until(async()=>connections>=2); // Graceful disconnect must reconnect and replay idempotently.
    const removal=Message.create({hash:Buffer.alloc(20,0x33),signer:Buffer.from(key.slice(2),'hex'),data:{fid:10,type:2,timestamp:add.data.timestamp+1,network:1,castRemoveBody:{targetHash:Buffer.from(hash.slice(2),'hex')}}});
    rpc.write({type:1,id:102,mergeMessageBody:{message:removal,deletedMessages:[]}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM freecast_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===102);
    assert.equal((await pool.query('SELECT deleted FROM freecast_feed_casts WHERE hash=$1',[hash])).rows[0].deleted,true);
    const second=Message.create({hash:Buffer.alloc(20,0x44),signer:Buffer.from(key.slice(2),'hex'),data:add.data});
    rpc.write({type:1,id:103,mergeMessageBody:{message:second,deletedMessages:[]}});
    rpc.write({type:2,id:104,pruneMessageBody:{message:second}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM freecast_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===104);
    assert.equal((await pool.query('SELECT deleted FROM freecast_feed_casts WHERE hash=$1',['0x'+'44'.repeat(20)])).rows[0].deleted,true);
    await enrollViewer(pool,888);await enrollViewer(pool,999);
    await until(async()=>Boolean((await pool.query('SELECT follows_synced_at FROM freecast_feed_users WHERE fid=999')).rows[0]?.follows_synced_at));
    await until(async()=>Boolean((await pool.query('SELECT backfill_done FROM freecast_feed_authors WHERE fid=20')).rows[0]?.backfill_done));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_authors WHERE fid=10')).rows[0].n,1);
    assert.equal((await pool.query('SELECT author_fid FROM freecast_feed_casts WHERE hash=$1',['0x'+'55'.repeat(20)])).rows[0].author_fid,'20');
    assert.equal((await pool.query('SELECT follows_failed FROM freecast_feed_users WHERE fid=888')).rows[0].follows_failed,true,'one failed user must not block another user import');
    assert.equal((await pool.query('SELECT requester_fid FROM freecast_feed_signers WHERE author_fid=10 AND signer=$1',[key])).rows[0].requester_fid,'9152');
  }finally{for(const timer of timers)clearTimeout(timer);if(stop)await stop();else await pool.end();server.forceShutdown();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
