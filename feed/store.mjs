import pg from 'pg';
import { createHash } from 'node:crypto';
export const validFid = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>0;
export function createPool(url,options={}) {
  return new pg.Pool({connectionString:url,max:6,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,options:'-c statement_timeout=10000',...options});
}
export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS kite_feed_users(fid bigint PRIMARY KEY,follows_synced_at timestamptz,generation bigint NOT NULL DEFAULT 0);
    ALTER TABLE kite_feed_users ADD COLUMN IF NOT EXISTS enrolled_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE kite_feed_users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE kite_feed_users ADD COLUMN IF NOT EXISTS follows_failed boolean NOT NULL DEFAULT false;
    ALTER TABLE kite_feed_users ADD COLUMN IF NOT EXISTS follows_retry_after timestamptz;
    ALTER TABLE kite_feed_users ADD COLUMN IF NOT EXISTS notifications_started_at timestamptz;
    CREATE TABLE IF NOT EXISTS kite_notifications(id bigserial UNIQUE,viewer_fid bigint REFERENCES kite_feed_users(fid),identity text NOT NULL,source_hash text NOT NULL,actor_fid bigint NOT NULL,kind text NOT NULL,timestamp bigint NOT NULL,target_fid bigint,target_hash text,payload jsonb,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(viewer_fid,identity));
    CREATE INDEX IF NOT EXISTS kite_notifications_page ON kite_notifications(viewer_fid,id DESC);
    CREATE INDEX IF NOT EXISTS kite_notifications_unread ON kite_notifications(viewer_fid,received_at);
    CREATE INDEX IF NOT EXISTS kite_notifications_source ON kite_notifications(source_hash);
    CREATE INDEX IF NOT EXISTS kite_notifications_target ON kite_notifications(target_fid,target_hash);
    CREATE TABLE IF NOT EXISTS kite_notification_deleted_casts(fid bigint NOT NULL,hash text NOT NULL,deleted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(fid,hash));
    CREATE TABLE IF NOT EXISTS kite_feed_follows(viewer_fid bigint REFERENCES kite_feed_users(fid),author_fid bigint NOT NULL,PRIMARY KEY(viewer_fid,author_fid));
    CREATE INDEX IF NOT EXISTS kite_feed_follow_author ON kite_feed_follows(author_fid);
    CREATE TABLE IF NOT EXISTS kite_feed_authors(fid bigint PRIMARY KEY,backfill_cursor text,backfill_done boolean NOT NULL DEFAULT false,backfilled_at timestamptz,signers_synced_at timestamptz,retry_after timestamptz,failed boolean NOT NULL DEFAULT false,epoch bigint NOT NULL DEFAULT 0);
    ALTER TABLE kite_feed_authors ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
    ALTER TABLE kite_feed_authors ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;
    CREATE INDEX IF NOT EXISTS kite_feed_author_attempt ON kite_feed_authors(last_attempted_at NULLS FIRST,backfilled_at NULLS FIRST,fid);
    CREATE TABLE IF NOT EXISTS kite_feed_casts(id bigserial UNIQUE,hash text PRIMARY KEY,author_fid bigint NOT NULL,timestamp bigint NOT NULL,signer text NOT NULL DEFAULT '',reply boolean NOT NULL DEFAULT false,payload jsonb,deleted boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS kite_feed_cast_author_time ON kite_feed_casts(author_fid,timestamp DESC,hash DESC) WHERE NOT deleted;
    CREATE INDEX IF NOT EXISTS kite_feed_cast_time ON kite_feed_casts(timestamp DESC,hash DESC) WHERE NOT deleted;
    CREATE TABLE IF NOT EXISTS kite_feed_signers(author_fid bigint NOT NULL,signer text NOT NULL,requester_fid bigint NOT NULL,PRIMARY KEY(author_fid,signer));
    CREATE TABLE IF NOT EXISTS kite_feed_checkpoints(shard integer PRIMARY KEY,event_id numeric(20) NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS kite_feed_health(id integer PRIMARY KEY CHECK(id=1),heartbeat timestamptz NOT NULL DEFAULT now(),connected_shards integer[] NOT NULL DEFAULT '{}');`);
}
export async function replaceFollows(pool,fid,authors) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO kite_feed_users(fid) VALUES($1) ON CONFLICT DO NOTHING',[fid]);
    await db.query('SELECT fid FROM kite_feed_users WHERE fid=$1 FOR UPDATE',[fid]);
    const previous=(await db.query('SELECT author_fid FROM kite_feed_follows WHERE viewer_fid=$1',[fid])).rows.map(r=>Number(r.author_fid)).sort((a,b)=>a-b);
    const next=[...new Set(authors.filter(validFid).map(Number))].filter(author=>author!==Number(fid)).sort((a,b)=>a-b);
    await db.query('DELETE FROM kite_feed_follows WHERE viewer_fid=$1 AND NOT(author_fid=ANY($2::bigint[]))',[fid,next]);
    await db.query('INSERT INTO kite_feed_follows(viewer_fid,author_fid) SELECT $1,unnest($2::bigint[]) ON CONFLICT DO NOTHING',[fid,next]);
    await db.query('INSERT INTO kite_feed_authors(fid) SELECT unnest($1::bigint[]) ON CONFLICT DO NOTHING',[next]);
    await db.query('UPDATE kite_feed_users SET follows_synced_at=now(),follows_failed=false,follows_retry_after=NULL,generation=generation+$2 WHERE fid=$1',[fid,JSON.stringify(previous)===JSON.stringify(next)?0:1]);
    await db.query('COMMIT');return next;
  } catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function pendingAuthors(pool) {
  // Rotate eligible work by attempt time so healthy refreshes cannot starve retries.
  return (await pool.query(`SELECT a.* FROM kite_feed_authors a
    WHERE EXISTS(SELECT 1 FROM kite_feed_follows f WHERE f.author_fid=a.fid)
      AND (a.retry_after IS NULL OR a.retry_after<now())
    ORDER BY a.last_attempted_at NULLS FIRST,a.backfilled_at NULLS FIRST,a.fid LIMIT 4`)).rows;
}
export async function saveCast(db,cast,{backfill=false}={}) {
  if(!validFid(cast?.data?.fid)||!/^0x[\da-f]{40}$/i.test(cast.hash)||!/^0x[\da-f]{64}$/i.test(cast.signer)||!Number.isSafeInteger(cast.data.timestamp)||typeof cast.data.castAddBody?.text!=='string')throw new Error('Invalid indexed cast');
  // Tombstones and live events always win over a concurrent historical page.
  await db.query(`INSERT INTO kite_feed_casts(hash,author_fid,timestamp,signer,reply,payload) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(hash) ${backfill?'DO NOTHING':`DO UPDATE SET payload=EXCLUDED.payload,signer=EXCLUDED.signer,updated_at=now() WHERE NOT kite_feed_casts.deleted`}`,
  [cast.hash.toLowerCase(),cast.data.fid,cast.data.timestamp,cast.signer.toLowerCase(),Boolean(cast.data.castAddBody.parentCastId),JSON.stringify(cast)]);
}
export async function deleteCast(db,hash,fid) {
  if(!/^0x[\da-f]{40}$/i.test(hash)||!validFid(fid))return;
  await db.query(`INSERT INTO kite_feed_casts(hash,author_fid,timestamp,deleted) VALUES($1,$2,0,true)
    ON CONFLICT(hash) DO UPDATE SET deleted=true,payload=NULL,updated_at=now()`,[hash.toLowerCase(),fid]);
}
async function nodeStatus(pool) {
  const health=(await pool.query('SELECT heartbeat,connected_shards FROM kite_feed_health WHERE id=1')).rows[0];
  const checkpoints=(await pool.query('SELECT shard,updated_at FROM kite_feed_checkpoints ORDER BY shard')).rows;
  return {workerOnline:Boolean(health&&Date.now()-new Date(health.heartbeat).getTime()<60000),connectedShards:health?.connected_shards||[],checkpoints:checkpoints.map(c=>({shard:c.shard,lastEventAt:c.updated_at}))};
}
export async function status(pool,fid) {
  const user=(await pool.query('SELECT follows_synced_at,generation,follows_failed FROM kite_feed_users WHERE fid=$1',[fid])).rows[0];
  const counts=(await pool.query(`SELECT count(*)::int AS following,count(*) FILTER(WHERE a.backfill_done)::int AS imported,count(*) FILTER(WHERE a.failed)::int AS failed FROM kite_feed_follows f JOIN kite_feed_authors a ON a.fid=f.author_fid WHERE f.viewer_fid=$1`,[fid])).rows[0];
  return {queued:!user?.follows_synced_at,followingFailed:Boolean(user?.follows_failed),following:counts.following,imported:counts.imported,failed:counts.failed,initializing:!user?.follows_synced_at||counts.imported<counts.following,
    followsSyncedAt:user?.follows_synced_at||null,...await nodeStatus(pool),generation:Number(user?.generation||0)};
}
export function parseFeedQuery(search) {
  const mode=search.get('mode')||'all',order=search.get('order')||'newest';
  if(!['all','include','exclude'].includes(mode)||!['newest','oldest'].includes(order))throw new Error('Invalid feed filter');
  const fids=(search.get('clients')||'').split(',').filter(Boolean),keys=(search.get('keys')||'').split(',').filter(Boolean);
  if(fids.length>100||keys.length>100||fids.some(fid=>!validFid(fid))||keys.some(key=>!/^0x[\da-f]{64}$/i.test(key)))throw new Error('Invalid client FIDs or public keys');
  const self=search.get('self')==='true';
  if(mode!=='all'&&!fids.length&&!keys.length&&!self)throw new Error('Select at least one client');
  return {fid:Number(search.get('fid')),mode,order,fids:[...new Set(fids.map(Number))].sort((a,b)=>a-b),keys:[...new Set(keys.map(k=>k.toLowerCase()))].sort(),self};
}
export async function queryFeed(pool,query,cursor='') {
  const {fid,mode,order,fids,keys,self}=query;
  const publicFeed=query.scope==='public';
  const state=publicFeed?{scope:'public',queued:false,followingFailed:false,following:0,imported:0,failed:0,initializing:false,followsSyncedAt:null,generation:0,...await nodeStatus(pool)}:await status(pool,fid);
  const fingerprint=createHash('sha256').update(JSON.stringify({...query,generation:state.generation})).digest('hex');
  let page;
  if(cursor){
    try{if(cursor.length>2000)throw 0;page=JSON.parse(Buffer.from(cursor,'base64url').toString());
      if(page.fingerprint!==fingerprint||!/^\d+$/.test(page.ceiling)||!Number.isSafeInteger(page.timestamp)||!/^0x[\da-f]{40}$/.test(page.hash))throw 0;
    }catch{throw new Error('Feed changed or cursor is invalid. Refresh the feed.');}
  }
  const ceiling=page?.ceiling||(await pool.query('SELECT COALESCE(max(id),0)::text AS id FROM kite_feed_casts')).rows[0].id;
  const params=publicFeed?[]:[fid];params.push(ceiling);const ceilingParam=params.length;
  let where='';
  if(mode!=='all'){
    params.push(fids,keys,self);
    const match=`(c.signer=ANY($${params.length-1}::text[]) OR COALESCE(s.requester_fid=ANY($${params.length-2}::bigint[]) OR ($${params.length} AND s.requester_fid=c.author_fid),false))`;
    where+=` AND ${mode==='exclude'?'NOT ':''}${match}`;
  }
  if(page){params.push(page.timestamp,page.hash);where+=` AND (c.timestamp,c.hash) ${order==='newest'?'<':'>'} ($${params.length-1},$${params.length})`;}
  const direction=order==='newest'?'DESC':'ASC';
  const {rows}=await pool.query(`SELECT c.payload,c.timestamp,c.hash FROM kite_feed_casts c
    ${publicFeed?'':'JOIN kite_feed_follows f ON f.author_fid=c.author_fid AND f.viewer_fid=$1'}
    ${mode==='all'?'':'LEFT JOIN kite_feed_signers s ON s.author_fid=c.author_fid AND s.signer=c.signer'}
    WHERE NOT c.deleted AND c.payload IS NOT NULL AND NOT c.reply AND c.id<=$${ceilingParam} ${where}
    ORDER BY c.timestamp ${direction},c.hash ${direction} LIMIT 31`,params);
  const visible=rows.slice(0,30),last=visible.at(-1);
  const nextPageToken=rows.length>30?Buffer.from(JSON.stringify({fingerprint,ceiling,timestamp:Number(last.timestamp),hash:last.hash})).toString('base64url'):'';
  return {messages:visible.map(row=>row.payload),nextPageToken,status:state};
}

export async function enrollViewer(pool,fid,{maxUsers=1000}={}) {
  if(!validFid(fid))throw new Error('Invalid enrollment FID');
  const db=await pool.connect();
  try{await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext(current_schema()),268439)');
    const existing=(await db.query('SELECT fid FROM kite_feed_users WHERE fid=$1',[fid])).rows.length>0;
    if(!existing&&Number((await db.query('SELECT count(*) AS count FROM kite_feed_users')).rows[0].count)>=maxUsers){
      const error=new Error('Feed enrollment is currently at capacity. Please try again later.');error.status=429;throw error;
    }
    await db.query('INSERT INTO kite_feed_users(fid) VALUES($1) ON CONFLICT(fid) DO UPDATE SET last_seen_at=now()',[fid]);
    await db.query('COMMIT');return {enrolled:true,fid:Number(fid)};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
