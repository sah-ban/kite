import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Server,ServerCredentials} from '@grpc/grpc-js';
import {HubEvent,Message} from '@farcaster/core';
// @ts-expect-error Node worker.
import {startWorker} from '../feed/worker.mjs';
// @ts-expect-error Node storage.
import {createPool,migrate,replaceFollows,enrollViewer,saveCast,status,pendingAuthors} from '../feed/store.mjs';

const key='0x'+'11'.repeat(32),hash='0x'+'22'.repeat(20);
const add={hash,signer:key,data:{fid:10,type:1,timestamp:Math.floor(Date.now()/1000)-1609459200,network:1,castAddBody:{text:'Worker fixture',mentions:[],mentionsPositions:[],embeds:[]}}};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('author scheduling gives retries a turn under continuous healthy work and preserves upgrade data',{skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
  const schema='worker_queue_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.KITE_TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  try{
    await migrate(pool);await replaceFollows(pool,123,[10,20,30,40,50,60]);await saveCast(pool,add);
    await pool.query("UPDATE kite_feed_authors SET backfill_done=true,backfilled_at=now()-interval '2 hours'");
    await pool.query("UPDATE kite_feed_authors SET failed=true,backfilled_at=now()-interval '6 hours' WHERE fid=60");
    // Exercise the automatic upgrade with existing casts and retry flags.
    await pool.query('DROP INDEX kite_feed_author_attempt');
    await pool.query('ALTER TABLE kite_feed_authors DROP COLUMN last_attempted_at');
    await migrate(pool);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM kite_feed_casts')).rows[0].n,1);
    assert.equal((await pool.query('SELECT failed FROM kite_feed_authors WHERE fid=60')).rows[0].failed,true);
    const first=await pendingAuthors(pool);assert.ok(first.some((row:any)=>Number(row.fid)===60),'an eligible failed author cannot be hidden behind healthy accounts');
    const seen=new Set<number>();
    for(let cycle=0;cycle<2;cycle++){
      const batch=await pendingAuthors(pool);
      for(const author of batch){
        seen.add(Number(author.fid));
        // Keep healthy jobs eligible, as in an overloaded refresh queue.
        await pool.query("UPDATE kite_feed_authors SET last_attempted_at=now(),retry_after=now()-interval '1 second' WHERE fid=$1",[author.fid]);
      }
    }
    assert.deepEqual([...seen].sort((a,b)=>a-b),[10,20,30,40,50,60]);
    await replaceFollows(pool,123,[10,20,30,40,50,60,70,80]);
    await pool.query("UPDATE kite_feed_authors SET retry_after=now()+interval '1 hour' WHERE fid=80");
    const next=await pendingAuthors(pool);
    assert.equal(Number(next[0].fid),70,'new authors get their first attempt promptly');
    assert.ok(next.every((row:any)=>Number(row.fid)!==80),'backoff is still respected');
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('worker integrates backfill, explicit subscriptions, atomic checkpoints, reconnect and cast removal', {skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
  const schema='worker_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.KITE_TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  await migrate(pool);await replaceFollows(pool,268438,[10]);
  const ghost={...add,hash:'0x'+'99'.repeat(20)};await saveCast(pool,ghost);
  await pool.query("INSERT INTO kite_feed_checkpoints(shard,event_id,updated_at) VALUES(1,50,now()-interval '3 days')");
  const server=new Server();let connections=0;let stop:(()=>Promise<void>)|undefined;let rpc:any;const timers:ReturnType<typeof setTimeout>[]=[];
  server.addService({subscribe:{path:'/HubService/Subscribe',requestStream:false,responseStream:true,requestDeserialize:(bytes:Buffer)=>bytes,requestSerialize:(bytes:Buffer)=>bytes,responseSerialize:(event:any)=>Buffer.from(HubEvent.encode(HubEvent.create(event)).finish()),responseDeserialize:HubEvent.decode}},
    {subscribe(call:any){connections++;rpc=call;assert.equal(call.request[0],10);assert.ok(call.request[1]>0);call.on('error',()=>{});
      timers.push(setTimeout(()=>call.write({type:1,id:101,mergeMessageBody:{message:Message.create({hash:Buffer.from(hash.slice(2),'hex'),signer:Buffer.from(key.slice(2),'hex'),data:add.data}),deletedMessages:[]}}),100));
      if(connections===1)timers.push(setTimeout(()=>call.end(),200));
    }});
  const port=await new Promise<number>((resolve,reject)=>server.bindAsync('127.0.0.1:0',ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
  async function until(check:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await check())return;await sleep(100);}throw Error('Worker fixture timed out');}
  const fetcher=async(url:URL)=>{
    assert.equal(url.origin,'https://worker-node.example');
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
    stop=await startWorker({DATABASE_URL:'fixture',HUBURL:'https://worker-node.example',KITE_FEED_FIDS:'268438',KITE_FEED_GRPC_URL:'http://127.0.0.1:'+port},{pool,fetcher,log:()=>{}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM kite_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===101);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM kite_feed_casts WHERE hash=$1',[hash])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM kite_feed_casts WHERE hash=$1',[ghost.hash])).rows[0].n,0);
    await until(async()=>connections>=2); // Graceful disconnect must reconnect and replay idempotently.
    const removal=Message.create({hash:Buffer.alloc(20,0x33),signer:Buffer.from(key.slice(2),'hex'),data:{fid:10,type:2,timestamp:add.data.timestamp+1,network:1,castRemoveBody:{targetHash:Buffer.from(hash.slice(2),'hex')}}});
    rpc.write({type:1,id:102,mergeMessageBody:{message:removal,deletedMessages:[]}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM kite_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===102);
    assert.equal((await pool.query('SELECT deleted FROM kite_feed_casts WHERE hash=$1',[hash])).rows[0].deleted,true);
    const second=Message.create({hash:Buffer.alloc(20,0x44),signer:Buffer.from(key.slice(2),'hex'),data:add.data});
    rpc.write({type:1,id:103,mergeMessageBody:{message:second,deletedMessages:[]}});
    rpc.write({type:2,id:104,pruneMessageBody:{message:second}});
    await until(async()=>Number((await pool.query('SELECT event_id FROM kite_feed_checkpoints WHERE shard=1')).rows[0]?.event_id)===104);
    assert.equal((await pool.query('SELECT deleted FROM kite_feed_casts WHERE hash=$1',['0x'+'44'.repeat(20)])).rows[0].deleted,true);
    await enrollViewer(pool,888);await enrollViewer(pool,999);
    await until(async()=>Boolean((await pool.query('SELECT follows_synced_at FROM kite_feed_users WHERE fid=999')).rows[0]?.follows_synced_at));
    await until(async()=>Boolean((await pool.query('SELECT backfill_done FROM kite_feed_authors WHERE fid=20')).rows[0]?.backfill_done));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM kite_feed_authors WHERE fid=10')).rows[0].n,1);
    assert.equal((await pool.query('SELECT author_fid FROM kite_feed_casts WHERE hash=$1',['0x'+'55'.repeat(20)])).rows[0].author_fid,'20');
    assert.equal((await pool.query('SELECT follows_failed FROM kite_feed_users WHERE fid=888')).rows[0].follows_failed,true,'one failed user must not block another user import');
    assert.equal((await pool.query('SELECT requester_fid FROM kite_feed_signers WHERE author_fid=10 AND signer=$1',[key])).rows[0].requester_fid,'9152');
  }finally{for(const timer of timers)clearTimeout(timer);if(stop)await stop();else await pool.end();server.forceShutdown();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('worker retries recent failed authors, preserves real failures and logs safe endpoint diagnostics',{skip:!process.env.KITE_TEST_DATABASE_URL},async()=>{
  const schema='worker_retry_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.KITE_TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool(process.env.KITE_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  await migrate(pool);await replaceFollows(pool,123,[10]);await replaceFollows(pool,456,[20]);
  await pool.query('UPDATE kite_feed_authors SET failed=true,backfill_done=true,backfilled_at=now(),retry_after=NULL,signers_synced_at=NULL');
  await pool.query('INSERT INTO kite_feed_checkpoints(shard,event_id) VALUES(1,100)');
  const server=new Server(),logs:string[]=[],castCalls:number[]=[];let stop:(()=>Promise<void>)|undefined,rpc:any;
  const previousWorker=await pool.connect();let previousReleased=false;
  await previousWorker.query('SELECT pg_advisory_lock(hashtext(current_schema()),268438)');
  let signerBlocked=true,castBlocked=true;
  const privateDetail='https://operator:private-password@private-node.example/?token=private-token';
  server.addService({subscribe:{path:'/HubService/Subscribe',requestStream:false,responseStream:true,requestDeserialize:(bytes:Buffer)=>bytes,requestSerialize:(bytes:Buffer)=>bytes,responseSerialize:(event:any)=>Buffer.from(HubEvent.encode(HubEvent.create(event)).finish()),responseDeserialize:HubEvent.decode}},
    {subscribe(call:any){rpc=call;call.on('error',()=>{});call.write({type:1,id:101,mergeMessageBody:{deletedMessages:[]}});}});
  const port=await new Promise<number>((resolve,reject)=>server.bindAsync('127.0.0.1:0',ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
  const fetcher=async(url:URL)=>{
    const endpoint=url.pathname.split('/').pop(),fid=Number(url.searchParams.get('fid'));
    if(endpoint==='info')return Response.json({shardInfos:[{shardId:1}]});
    if(endpoint==='events')return Response.json({events:[{id:100}]});
    if(endpoint==='linksByFid')return Response.json({messages:[{data:{type:5,linkBody:{targetFid:fid===123?10:20}}}]});
    if(endpoint==='onChainSignersByFid'||endpoint==='signersByFid'){
      if(fid===20&&signerBlocked)return Response.json({error:privateDetail},{status:403});
      return Response.json(endpoint==='signersByFid'?{signers:[]}:{events:[]});
    }
    if(endpoint==='castsByFid'){
      castCalls.push(fid);
      if(fid===20&&castBlocked)return Response.json({error:privateDetail},{status:503});
      return Response.json({messages:[]});
    }
    throw Error('Unexpected fixture endpoint');
  };
  async function until(check:()=>Promise<boolean>){for(let i=0;i<100;i++){if(await check())return;await sleep(100);}throw Error('Retry fixture timed out');}
  const author=async(fid:number)=>(await pool.query('SELECT * FROM kite_feed_authors WHERE fid=$1',[fid])).rows[0];
  try{
    const starting=startWorker({DATABASE_URL:'fixture',HUBURL:'https://private-node.example',KITE_FEED_FIDS:'123',KITE_FEED_GRPC_URL:'http://127.0.0.1:'+port},{pool,fetcher,log:(line:string)=>logs.push(line)});
    await until(async()=>logs.includes('Feed worker waiting for the previous worker to stop'));
    assert.equal(castCalls.length,0,'the replacement cannot process jobs while the previous worker holds the lock');
    await previousWorker.query('SELECT pg_advisory_unlock(hashtext(current_schema()),268438)');previousWorker.release();previousReleased=true;
    stop=await starting;
    await until(async()=>!((await author(10)).failed)&&logs.some(line=>line.includes('FID 20 signer sync failed')));
    assert.ok(castCalls.includes(10),'a recently completed but failed author must retry actual history');
    assert.equal((await author(20)).failed,true);
    assert.ok(!castCalls.includes(20),'failed signer validation must not be silently treated as recovery');
    assert.ok(logs.some(line=>line.includes('Feed worker started for 2 viewer(s), 1 shards')),'startup includes database-enrolled viewers');
    assert.ok(logs.some(line=>line.includes('onChainSignersByFid: HTTP 403')&&line.includes('signersByFid: HTTP 403')));
    assert.ok(logs.some(line=>line==='Feed author FID 10 indexing recovered'));

    await until(async()=>Boolean(rpc));
    const liveHash=Buffer.alloc(20,0x77);
    rpc.write({type:1,id:102,mergeMessageBody:{message:Message.create({hash:liveHash,signer:Buffer.from(key.slice(2),'hex'),data:{...add.data,fid:20}}),deletedMessages:[]}});
    await until(async()=>Boolean((await pool.query('SELECT hash FROM kite_feed_casts WHERE hash=$1',['0x'+liveHash.toString('hex')])).rows.length));
    assert.equal((await author(20)).failed,true,'a live cast does not hide a failed background import');
    assert.equal((await status(pool,456)).failed,1);

    await until(async()=>Boolean((await author(20)).retry_after));
    signerBlocked=false;await pool.query('UPDATE kite_feed_authors SET retry_after=NULL WHERE fid=20');
    await until(async()=>castCalls.includes(20)&&logs.some(line=>line.includes('FID 20 cast history failed')&&line.includes('castsByFid: HTTP 503')));
    assert.equal((await author(20)).failed,true,'an ongoing history error must keep the retry flag');
    await until(async()=>Boolean((await author(20)).retry_after));
    castBlocked=false;await pool.query('UPDATE kite_feed_authors SET retry_after=NULL WHERE fid=20');
    await until(async()=>!((await author(20)).failed));
    assert.ok(castCalls.filter(fid=>fid===20).length>=2);
    assert.equal((await status(pool,456)).failed,0,'successful retry clears the API banner count');
    assert.ok(logs.some(line=>line==='Feed author FID 20 indexing recovered'));
    assert.ok(logs.every(line=>!line.includes('private-')&&!line.includes('https://')&&!line.includes('127.0.0.1')));
  }finally{if(!previousReleased){await previousWorker.query('SELECT pg_advisory_unlock(hashtext(current_schema()),268438)');previousWorker.release();}if(stop)await stop();else await pool.end();server.forceShutdown();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
