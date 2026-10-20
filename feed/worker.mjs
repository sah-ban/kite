import {Client,credentials} from '@grpc/grpc-js';
import {createPool,migrate,replaceFollows,enrollViewer,saveCast,deleteCast,validFid} from './store.mjs';
import {castOf,dataOf,hex,requesterOf,subscriptionRequest,decodeEvent} from './protocol.mjs';
import {feedFids} from './api.mjs';
import {indexNotification} from './notifications.mjs';
import {pathToFileURL} from 'node:url';

export async function startWorker(config,{pool=createPool(config.DATABASE_URL),fetcher=fetch,log=console.log}={}) {
  let viewers=new Set(feedFids(config));
  const days=Number(config.FREECAST_FEED_HISTORY_DAYS||30);
  if(!config.DATABASE_URL||!config.FREECAST_FEED_GRPC_URL)throw new Error('Configure DATABASE_URL and FREECAST_FEED_GRPC_URL');
  if(!Number.isInteger(days)||days<1||days>365)throw new Error('Invalid feed history days');
  const grpcUrl=new URL(config.FREECAST_FEED_GRPC_URL);
  if(!['http:','https:'].includes(grpcUrl.protocol)||grpcUrl.username||grpcUrl.password)throw new Error('Invalid feed gRPC URL');
  const httpUrl=config.FREECAST_FEED_HTTP_URL||config.NEXT_PUBLIC_HUBURL||'http://127.0.0.1:3381';
  const cutoff=()=>Math.floor(Date.now()/1000)-1609459200-days*86400;
  const stopController=new AbortController();let stopped=false,tracked=new Set(),dirtyViewers=new Map(),lastGraph=0,lastCleanup=0,lastRecovery=0;
  const connected=new Set(),clients=new Set(),streams=new Set();
  async function read(endpoint,params={}) {
    const url=new URL('/v1/'+endpoint,httpUrl);url.search=new URLSearchParams(Object.entries(params).map(([key,value])=>[key,String(value)])).toString();
    const response=await fetcher(url,{signal:AbortSignal.any([stopController.signal,AbortSignal.timeout(25000)]),redirect:'error'});
    if(!response.ok)throw new Error('Feed node request failed');return response.json();
  }
  async function pause(ms){if(stopped)return;await new Promise(resolve=>{const timer=setTimeout(done,ms);function done(){clearTimeout(timer);stopController.signal.removeEventListener('abort',done);resolve();}stopController.signal.addEventListener('abort',done,{once:true});});}
  await migrate(pool);
  // Prevent two workers consuming the same checkpoints or claiming the same backfill pages.
  const lock=await pool.connect();
  if(!(await lock.query('SELECT pg_try_advisory_lock(hashtext(current_schema()),268438) AS locked')).rows[0].locked){lock.release();throw new Error('A feed worker is already running');}
  lock.on('error',()=>{stopped=true;stopController.abort();for(const stream of streams)stream.cancel();log('Feed database connection lost; stopping');process.exit(1);});
  for(const viewer of viewers)await enrollViewer(pool,viewer);
  let notificationViewers=new Map();
  async function activateNotifications(){
    await pool.query('UPDATE freecast_feed_users SET notifications_started_at=clock_timestamp() WHERE notifications_started_at IS NULL');
    notificationViewers=new Map((await pool.query('SELECT fid,notifications_started_at FROM freecast_feed_users')).rows.map(row=>[Number(row.fid),Math.ceil(new Date(row.notifications_started_at).getTime()/1000)-1609459200]));
  }
  await activateNotifications();
  async function syncGraph(){
    await activateNotifications();
    viewers=new Set((await pool.query('SELECT fid FROM freecast_feed_users')).rows.map(row=>Number(row.fid)));
    const pending=(await pool.query(`SELECT fid FROM freecast_feed_users WHERE (follows_retry_after IS NULL OR follows_retry_after<now())
      AND (follows_synced_at IS NULL OR follows_synced_at<now()-interval '5 minutes' OR fid=ANY($1::bigint[]))
      ORDER BY follows_synced_at NULLS FIRST,enrolled_at,fid LIMIT 2`,[[...dirtyViewers.keys()]])).rows;
    let changed=false;
    await Promise.all(pending.map(async row=>{
      const viewer=Number(row.fid),revision=dirtyViewers.get(Number(row.fid));
      try{
        const authors=[];let token='';const seen=new Set();
        do{const page=await read('linksByFid',{fid:viewer,link_type:'follow',pageSize:100,...(token?{pageToken:token}:{})});
          if(!Array.isArray(page.messages))throw new Error('Invalid follow page');
          for(const message of page.messages){if((message.data?.type===5||message.data?.type==='MESSAGE_TYPE_LINK_ADD')&&validFid(message.data.linkBody?.targetFid))authors.push(Number(message.data.linkBody.targetFid));}
          if(authors.length>20000)throw new Error('Follow list exceeds import capacity');
          token=page.nextPageToken||'';if(token&&seen.has(token))throw new Error('Repeated follow cursor');seen.add(token);
        }while(token);
        await replaceFollows(pool,viewer,authors);changed=true;
      }catch{if(!stopped)await pool.query("UPDATE freecast_feed_users SET follows_failed=true,follows_retry_after=now()+interval '30 seconds' WHERE fid=$1",[viewer]);}
      finally{if(dirtyViewers.get(viewer)===revision)dirtyViewers.delete(viewer);}
    }));
    if(changed){tracked=new Set((await pool.query('SELECT DISTINCT author_fid FROM freecast_feed_follows')).rows.map(row=>Number(row.author_fid)));log(`Feed following lists synced: ${viewers.size} viewers, ${tracked.size} authors`);}
    lastGraph=Date.now();
  }
  // Load saved tracking before any replay; refresh follow lists before backfill begins.
  tracked=new Set((await pool.query('SELECT DISTINCT author_fid FROM freecast_feed_follows')).rows.map(row=>Number(row.author_fid)));
  async function syncSigners(fid){
    const maps=new Map();let successes=0;
    for(const endpoint of ['onChainSignersByFid','signersByFid']){
      try{let token='';const seen=new Set();do{
        const page=await read(endpoint,{fid,pageSize:100,...(token?{pageToken:token}:{})});
        const values=endpoint==='signersByFid'?page.signers:page.events;if(!Array.isArray(values))throw new Error('Invalid signer page');
        for(const value of values){if(endpoint==='signersByFid'&&(Number(value.fid)!==fid||value.keyType!==1))continue;const key=endpoint==='signersByFid'?value.key:value.signerEventBody?.key;
          const requester=requesterOf(value);if(requester&&/^0x[\da-f]{64}$/i.test(key))maps.set(key.toLowerCase(),requester);}
        token=page.nextPageToken||'';if(token&&seen.has(token))throw new Error('Repeated signer cursor');seen.add(token);
      }while(token);successes++;}catch{if(stopped)throw new Error('Stopping');}
    }
    if(!successes)throw new Error('Signer sync unavailable');
    const db=await pool.connect();try{await db.query('BEGIN');
      for(const [key,requester]of maps)await db.query('INSERT INTO freecast_feed_signers(author_fid,signer,requester_fid) VALUES($1,$2,$3) ON CONFLICT(author_fid,signer) DO UPDATE SET requester_fid=EXCLUDED.requester_fid',[fid,key,requester]);
      await db.query('UPDATE freecast_feed_authors SET signers_synced_at=now() WHERE fid=$1',[fid]);await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async function consume(shard,event){
    const db=await pool.connect();try{await db.query('BEGIN');
      const checkpoint=(await db.query('SELECT event_id FROM freecast_feed_checkpoints WHERE shard=$1 FOR UPDATE',[shard])).rows[0];
      if(checkpoint&&BigInt(event.id)<=BigInt(checkpoint.event_id)){await db.query('ROLLBACK');return;}
      const merge=event.mergeMessageBody,pruned=event.pruneMessageBody?.message||event.revokeMessageBody?.message;
      const apply=async(message,removed=false)=>{
        const data=dataOf(message);if(!data)return;
        await indexNotification(db,message,notificationViewers,removed);
        if(viewers.has(Number(data.fid))&&[5,6,14].includes(data.type))dirtyViewers.set(Number(data.fid),(dirtyViewers.get(Number(data.fid))||0)+1);
        if(!tracked.has(Number(data.fid)))return;
        if(removed&&data.castAddBody)await deleteCast(db,hex(message.hash),data.fid);
        else if(data.castRemoveBody)await deleteCast(db,hex(data.castRemoveBody.targetHash),data.fid);
        else if(data.castAddBody&&data.timestamp>=cutoff()){
          await saveCast(db,castOf(message));
          await db.query(`UPDATE freecast_feed_authors a SET signers_synced_at=NULL WHERE fid=$1 AND NOT EXISTS(SELECT 1 FROM freecast_feed_signers s WHERE s.author_fid=$1 AND s.signer=$2)`,[data.fid,hex(message.signer)]);
        }
      };
      if(merge){for(const deleted of merge.deletedMessages||[])await apply(deleted,true);await apply(merge.message);}
      if(pruned)await apply(pruned,true);
      await db.query('INSERT INTO freecast_feed_checkpoints(shard,event_id) VALUES($1,$2) ON CONFLICT(shard) DO UPDATE SET event_id=EXCLUDED.event_id,updated_at=now()',[shard,String(event.id)]);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  async function subscribe(shard){
    while(!stopped){let client,stream;
      try{
        let checkpoint=(await pool.query('SELECT event_id,updated_at FROM freecast_feed_checkpoints WHERE shard=$1',[shard])).rows[0];
        if(!checkpoint||Date.now()-new Date(checkpoint.updated_at).getTime()>2*86400000){
          const page=await read('events',{shard_index:shard,reverse:true,pageSize:1});const latest=page.events?.[0]?.id;
          if(!latest)throw new Error('No event checkpoint available');
          if(checkpoint&&Date.now()-lastRecovery>60000){
            lastRecovery=Date.now();const db=await pool.connect();
            try{await db.query('BEGIN');
              // Once event retention is exceeded, rebuild current state rather than retaining missed deletions.
              await db.query('DELETE FROM freecast_feed_casts WHERE author_fid=ANY($1::bigint[])',[[...tracked]]);
              await db.query('UPDATE freecast_feed_authors SET backfill_done=false,backfill_cursor=NULL,backfilled_at=NULL,retry_after=NULL,epoch=epoch+1 WHERE fid=ANY($1::bigint[])',[[...tracked]]);
              await db.query('UPDATE freecast_feed_users SET generation=generation+1');
              // Missed removals cannot be reconstructed without a history import.
              await db.query('DELETE FROM freecast_notifications');
              await db.query('UPDATE freecast_feed_users SET notifications_started_at=clock_timestamp()');
              await db.query('COMMIT');
              await activateNotifications();
            }catch(error){await db.query('ROLLBACK');lastRecovery=0;throw error;}finally{db.release();}
          }
          await pool.query('INSERT INTO freecast_feed_checkpoints(shard,event_id) VALUES($1,$2) ON CONFLICT(shard) DO UPDATE SET event_id=EXCLUDED.event_id,updated_at=now()',[shard,String(latest)]);
          checkpoint={event_id:String(latest)};
        }
        client=new Client(grpcUrl.host,grpcUrl.protocol==='https:'?credentials.createSsl():credentials.createInsecure(),{'grpc.keepalive_time_ms':30000,'grpc.keepalive_timeout_ms':10000,'grpc.max_receive_message_length':16*1024*1024});clients.add(client);
        stream=client.makeServerStreamRequest('/HubService/Subscribe',value=>value,decodeEvent,subscriptionRequest(shard,checkpoint.event_id));streams.add(stream);
        stream.on('metadata',()=>connected.add(shard));
        for await(const event of stream){if(stopped)break;await consume(shard,event);}
      }catch{if(!stopped)log(`Feed shard ${shard} reconnecting`);}
      finally{connected.delete(shard);if(stream){streams.delete(stream);stream.cancel();}if(client){clients.delete(client);client.close();}}
      await pause(3000);
    }
  }
  async function backfill(author){
    const fid=Number(author.fid);
    try{
      if(!author.signers_synced_at||Date.now()-new Date(author.signers_synced_at).getTime()>300000)await syncSigners(fid);
      if(author.backfill_done&&Date.now()-new Date(author.backfilled_at).getTime()<3600000){await pool.query('UPDATE freecast_feed_authors SET retry_after=now()+interval \'5 minutes\' WHERE fid=$1',[fid]);return;}
      const token=author.backfill_done?'':author.backfill_cursor||'';
      const page=await read('castsByFid',{fid,pageSize:100,reverse:true,...(token?{pageToken:token}:{})});
      if(!Array.isArray(page.messages))throw new Error('Invalid cast page');
      let old=false;
      const db=await pool.connect();try{await db.query('BEGIN');
        for(const message of page.messages){const cast=castOf(message);if(cast){if(cast.data.timestamp<cutoff()){old=true;continue;}await saveCast(db,cast,{backfill:true});}else if(message.data?.castRemoveBody)await deleteCast(db,hex(message.data.castRemoveBody.targetHash),fid);}
        const next=page.nextPageToken||'';
        // Periodic reconciliation checks the newest page; initial imports walk history.
        const done=author.backfill_done||old||!next;
        if(!done&&next===token)throw new Error('Repeated cast cursor');
        await db.query(`UPDATE freecast_feed_authors SET backfill_cursor=$2,backfill_done=$3,backfilled_at=now(),failed=false,retry_after=CASE WHEN $3 THEN now()+interval '5 minutes' ELSE NULL END WHERE fid=$1 AND epoch=$4`,[fid,done?null:next,done,author.epoch]);
        await db.query('COMMIT');
      }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    }catch{if(!stopped)await pool.query(`UPDATE freecast_feed_authors SET failed=true,retry_after=now()+interval '30 seconds' WHERE fid=$1`,[fid]);}
  }
  const info=await read('info');const shards=(info.shardInfos||[]).map(shard=>shard.shardId).filter(shard=>Number.isInteger(shard)&&shard>0);
  if(!shards.length)throw new Error('No message shards available');
  // Subscribe first, then historical import. Unknown authors added by the graph sync are backfilled.
  const subscriptions=shards.map(subscribe);
  const heartbeat=setInterval(()=>{void pool.query('INSERT INTO freecast_feed_health(id,heartbeat,connected_shards) VALUES(1,now(),$1) ON CONFLICT(id) DO UPDATE SET heartbeat=now(),connected_shards=EXCLUDED.connected_shards',[[...connected]]).catch(()=>{});},10000);
  const jobs=(async()=>{while(!stopped){
    try{
      if(Date.now()-lastGraph>2000)await syncGraph();
      const authors=(await pool.query(`SELECT a.* FROM freecast_feed_authors a WHERE EXISTS(SELECT 1 FROM freecast_feed_follows f WHERE f.author_fid=a.fid) AND (retry_after IS NULL OR retry_after<now()) ORDER BY backfill_done,failed,backfilled_at NULLS FIRST,fid LIMIT 4`)).rows;
      await Promise.all(authors.map(backfill));
      if(Date.now()-lastCleanup>3600000){await pool.query('DELETE FROM freecast_feed_casts WHERE (NOT deleted AND timestamp<$1) OR (deleted AND updated_at<now()-interval \'45 days\')',[cutoff()]);await pool.query('DELETE FROM freecast_notifications WHERE timestamp<$1',[cutoff()]);await pool.query("DELETE FROM freecast_notification_deleted_casts WHERE deleted_at<now()-interval '45 days'");lastCleanup=Date.now();}
      await pause(authors.length?100:1000);
    }catch{if(!stopped)log('Feed sync retrying');await pause(5000);}
  }})();
  log(`Feed worker started for ${viewers.size} viewer(s), ${shards.length} shards`);
  return async()=>{stopped=true;stopController.abort();clearInterval(heartbeat);for(const stream of streams)stream.cancel();for(const client of clients)client.close();await Promise.allSettled([jobs,...subscriptions]);await lock.query('SELECT pg_advisory_unlock(hashtext(current_schema()),268438)');lock.release();await pool.end();};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.loadEnvFile('.env');}catch(error){if(error.code!=='ENOENT')throw error;}
  try{const stop=await startWorker(process.env);let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(stopping)return;stopping=true;await stop();process.exit(0);});}
  catch{console.error('Feed worker could not start. Check database and node configuration.');process.exit(1);}
}
