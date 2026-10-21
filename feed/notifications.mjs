import {castOf,dataOf,hex} from './protocol.mjs';
import {validFid} from './store.mjs';
const hash=value=>/^0x[\da-f]{40}$/.test(value);
export const notificationKinds=['mention','reply','like','recast','follow'];

// Runs inside the same transaction as the stream checkpoint. No historical reads.
export async function indexNotification(db,message,viewers,removed=false){
  const data=dataOf(message);if(!data||!validFid(data.fid))return;
  const actor=Number(data.fid),source=hex(message.hash),time=Number(data.timestamp);
  if(!hash(source)||!Number.isSafeInteger(time)||time<0)return;
  if(removed){
    if(data.castAddBody)await db.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[String(actor),source]);
    await db.query('DELETE FROM kite_notifications WHERE source_hash=$1 OR ($2 AND target_fid=$3 AND target_hash=$1)',[source,Boolean(data.castAddBody),actor]);
    if(data.castAddBody&&viewers.has(actor))await db.query('INSERT INTO kite_notification_deleted_casts(fid,hash) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,source]);
    return;
  }
  const cast=data.castAddBody,reaction=data.reactionBody,link=data.linkBody;
  const put=async(viewer,kind,identity,target,payload)=>{
    viewer=Number(viewer);const start=viewers.get(viewer);
    if(viewer===actor||start===undefined||time<start)return;
    const targetHash=target?hex(target.hash):null;
    if(target&&(!validFid(target.fid)||!hash(targetHash)))return;
    // Serialize cross-shard target removals with reactions arriving at the same time.
    if(target)await db.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[String(target.fid),targetHash]);
    await db.query(`INSERT INTO kite_notifications(viewer_fid,identity,source_hash,actor_fid,kind,timestamp,target_fid,target_hash,payload)
      SELECT $1,$2,$3,$4,$5,$6::bigint,$7,$8,$9 WHERE EXISTS(SELECT 1 FROM kite_feed_users WHERE fid=$1 AND $6::bigint>=ceil(extract(epoch FROM notifications_started_at))-1609459200) AND NOT EXISTS(SELECT 1 FROM kite_notification_deleted_casts WHERE fid=$7 AND hash=$8)
      ON CONFLICT(viewer_fid,identity) DO UPDATE SET source_hash=EXCLUDED.source_hash,kind=EXCLUDED.kind,timestamp=EXCLUDED.timestamp,payload=EXCLUDED.payload,received_at=clock_timestamp(),id=EXCLUDED.id
      WHERE kite_notifications.timestamp<EXCLUDED.timestamp`,[viewer,identity,source,actor,kind,time,target?.fid||null,targetHash,payload?JSON.stringify(payload):null]);
  };
  if(cast){
    const parent=Number(cast.parentCastId?.fid),targets=new Set((cast.mentions||[]).map(Number));
    if(validFid(parent))targets.add(parent);
    for(const viewer of targets)await put(viewer,viewer===parent?'reply':'mention',`cast:${actor}:${source}`,{fid:actor,hash:source},castOf(message));
  }else if(data.castRemoveBody){
    const target=hex(data.castRemoveBody.targetHash);if(!hash(target))return;
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[String(actor),target]);
    await db.query('DELETE FROM kite_notifications WHERE source_hash=$1 OR (target_fid=$2 AND target_hash=$1)',[target,actor]);
    // Own casts need tombstones even when their author is not in the Following index.
    if(viewers.has(actor))await db.query('INSERT INTO kite_notification_deleted_casts(fid,hash) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor,target]);
  }else if(reaction?.targetCastId){
    const target=reaction.targetCastId,kind=Number(reaction.type)===1?'like':Number(reaction.type)===2?'recast':null;
    if(!kind||!viewers.has(Number(target.fid)))return;
    const identity=`${kind}:${actor}:${hex(target.hash)}`;
    if(Number(data.type)===4)await db.query('DELETE FROM kite_notifications WHERE viewer_fid=$1 AND identity=$2 AND timestamp<=$3',[target.fid,identity,time]);
    else if(Number(data.type)===3)await put(target.fid,kind,identity,target);
  }else if(link?.type==='follow'&&validFid(link.targetFid)){
    if(!viewers.has(Number(link.targetFid)))return;
    const identity=`follow:${actor}`;
    if(Number(data.type)===6)await db.query('DELETE FROM kite_notifications WHERE viewer_fid=$1 AND identity=$2 AND timestamp<=$3',[link.targetFid,identity,time]);
    else if(Number(data.type)===5)await put(link.targetFid,'follow',identity);
  }else if(data.linkCompactStateBody?.type==='follow'){
    // A compact state is not a new follow, but can remove old follow notifications.
    await db.query("DELETE FROM kite_notifications WHERE actor_fid=$1 AND kind='follow' AND NOT(viewer_fid=ANY($2::bigint[])) AND timestamp<=$3",[actor,data.linkCompactStateBody.targetFids||[],time]);
  }
}

export async function queryNotifications(pool,fid,search){
  const kind=search.get('kind')||'all',cursor=search.get('cursor')||'',summary=search.get('summary')==='true';
  if(kind!=='all'&&!notificationKinds.includes(kind))throw Object.assign(new Error('Invalid notification filter'),{status:400});
  if(cursor&&(!/^\d{1,19}$/.test(cursor)||BigInt(cursor)>9223372036854775807n))throw Object.assign(new Error('Invalid notification cursor'),{status:400});
  const since=search.get('since')||'1970-01-01T00:00:00.000Z';
  if(!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(since)||!Number.isFinite(Date.parse(since))||since.length>40)throw Object.assign(new Error('Invalid notification read time'),{status:400});
  const state=(await pool.query(`SELECT u.notifications_started_at,h.heartbeat,h.connected_shards,(SELECT count(*) FROM kite_feed_checkpoints) AS expected_shards,clock_timestamp() AS server_time FROM kite_feed_users u LEFT JOIN kite_feed_health h ON h.id=1 WHERE u.fid=$1`,[fid])).rows[0];
  const unread=(await pool.query('SELECT count(*)::int AS count FROM kite_notifications WHERE viewer_fid=$1 AND received_at>$2',[fid,since])).rows[0].count;
  const rows=summary?[]:(await pool.query(`SELECT n.*,COALESCE(n.payload,c.payload) AS cast FROM kite_notifications n LEFT JOIN kite_feed_casts c ON c.hash=n.target_hash AND c.author_fid=n.target_fid AND NOT c.deleted WHERE n.viewer_fid=$1 AND ($2='all' OR n.kind=$2) AND ($3::bigint IS NULL OR n.id<$3) ORDER BY n.id DESC LIMIT 51`,[fid,kind,cursor||null])).rows;
  return {items:rows.slice(0,50).map(row=>({id:row.identity,kind:row.kind,actor:Number(row.actor_fid),timestamp:Number(row.timestamp),receivedAt:row.received_at,...(row.cast?{cast:row.cast}:{}),...(row.target_hash?{target:{fid:Number(row.target_fid),hash:row.target_hash}}:{})})),nextPageToken:rows.length>50?String(rows[49].id):'',unread,serverTime:state?.server_time||new Date(),startedAt:state?.notifications_started_at||null,workerOnline:Boolean(state?.heartbeat&&Date.now()-new Date(state.heartbeat).getTime()<60000&&state.connected_shards?.length>0&&state.connected_shards.length>=Number(state.expected_shards))};
}
