import pg from 'pg';
import { createHash } from 'node:crypto';
export const validFid = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>0;
export function createPool(url,options={}) {
  return new pg.Pool({connectionString:url,max:6,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,options:'-c statement_timeout=10000',...options});
}
export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS freecast_feed_users(fid bigint PRIMARY KEY,follows_synced_at timestamptz,generation bigint NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS freecast_feed_follows(viewer_fid bigint REFERENCES freecast_feed_users(fid),author_fid bigint NOT NULL,PRIMARY KEY(viewer_fid,author_fid));
    CREATE INDEX IF NOT EXISTS freecast_feed_follow_author ON freecast_feed_follows(author_fid);
    CREATE TABLE IF NOT EXISTS freecast_feed_authors(fid bigint PRIMARY KEY,backfill_cursor text,backfill_done boolean NOT NULL DEFAULT false,backfilled_at timestamptz,signers_synced_at timestamptz,retry_after timestamptz,failed boolean NOT NULL DEFAULT false,epoch bigint NOT NULL DEFAULT 0);
    ALTER TABLE freecast_feed_authors ADD COLUMN IF NOT EXISTS epoch bigint NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS freecast_feed_casts(id bigserial UNIQUE,hash text PRIMARY KEY,author_fid bigint NOT NULL,timestamp bigint NOT NULL,signer text NOT NULL DEFAULT '',reply boolean NOT NULL DEFAULT false,payload jsonb,deleted boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS freecast_feed_cast_author_time ON freecast_feed_casts(author_fid,timestamp DESC,hash DESC) WHERE NOT deleted;
    CREATE INDEX IF NOT EXISTS freecast_feed_cast_time ON freecast_feed_casts(timestamp DESC,hash DESC) WHERE NOT deleted;
    CREATE TABLE IF NOT EXISTS freecast_feed_signers(author_fid bigint NOT NULL,signer text NOT NULL,requester_fid bigint NOT NULL,PRIMARY KEY(author_fid,signer));
    CREATE TABLE IF NOT EXISTS freecast_feed_checkpoints(shard integer PRIMARY KEY,event_id numeric(20) NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS freecast_feed_health(id integer PRIMARY KEY CHECK(id=1),heartbeat timestamptz NOT NULL DEFAULT now(),connected_shards integer[] NOT NULL DEFAULT '{}');`);
}
export async function replaceFollows(pool,fid,authors) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO freecast_feed_users(fid) VALUES($1) ON CONFLICT DO NOTHING',[fid]);
    await db.query('SELECT fid FROM freecast_feed_users WHERE fid=$1 FOR UPDATE',[fid]);
    const previous=(await db.query('SELECT author_fid FROM freecast_feed_follows WHERE viewer_fid=$1',[fid])).rows.map(r=>Number(r.author_fid)).sort((a,b)=>a-b);
    const next=[...new Set(authors.filter(validFid).map(Number))].filter(author=>author!==Number(fid)).sort((a,b)=>a-b);
    await db.query('DELETE FROM freecast_feed_follows WHERE viewer_fid=$1 AND NOT(author_fid=ANY($2::bigint[]))',[fid,next]);
    await db.query('INSERT INTO freecast_feed_follows(viewer_fid,author_fid) SELECT $1,unnest($2::bigint[]) ON CONFLICT DO NOTHING',[fid,next]);
    await db.query('INSERT INTO freecast_feed_authors(fid) SELECT unnest($1::bigint[]) ON CONFLICT DO NOTHING',[next]);
    await db.query('UPDATE freecast_feed_users SET follows_synced_at=now(),generation=generation+$2 WHERE fid=$1',[fid,JSON.stringify(previous)===JSON.stringify(next)?0:1]);
    await db.query('COMMIT');return next;
  } catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function saveCast(db,cast,{backfill=false}={}) {
  if(!validFid(cast?.data?.fid)||!/^0x[\da-f]{40}$/i.test(cast.hash)||!/^0x[\da-f]{64}$/i.test(cast.signer)||!Number.isSafeInteger(cast.data.timestamp)||typeof cast.data.castAddBody?.text!=='string')throw new Error('Invalid indexed cast');
  // Tombstones and live events always win over a concurrent historical page.
  await db.query(`INSERT INTO freecast_feed_casts(hash,author_fid,timestamp,signer,reply,payload) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(hash) ${backfill?'DO NOTHING':`DO UPDATE SET payload=EXCLUDED.payload,signer=EXCLUDED.signer,updated_at=now() WHERE NOT freecast_feed_casts.deleted`}`,
  [cast.hash.toLowerCase(),cast.data.fid,cast.data.timestamp,cast.signer.toLowerCase(),Boolean(cast.data.castAddBody.parentCastId),JSON.stringify(cast)]);
}
export async function deleteCast(db,hash,fid) {
  if(!/^0x[\da-f]{40}$/i.test(hash)||!validFid(fid))return;
  await db.query(`INSERT INTO freecast_feed_casts(hash,author_fid,timestamp,deleted) VALUES($1,$2,0,true)
    ON CONFLICT(hash) DO UPDATE SET deleted=true,payload=NULL,updated_at=now()`,[hash.toLowerCase(),fid]);
}
export async function status(pool,fid) {
  const user=(await pool.query('SELECT follows_synced_at,generation FROM freecast_feed_users WHERE fid=$1',[fid])).rows[0];
  const counts=(await pool.query(`SELECT count(*)::int AS following,count(*) FILTER(WHERE a.backfill_done)::int AS imported,count(*) FILTER(WHERE a.failed)::int AS failed FROM freecast_feed_follows f JOIN freecast_feed_authors a ON a.fid=f.author_fid WHERE f.viewer_fid=$1`,[fid])).rows[0];
  const health=(await pool.query('SELECT heartbeat,connected_shards FROM freecast_feed_health WHERE id=1')).rows[0];
  const checkpoints=(await pool.query('SELECT shard,updated_at FROM freecast_feed_checkpoints ORDER BY shard')).rows;
  return {following:counts.following,imported:counts.imported,failed:counts.failed,initializing:!user?.follows_synced_at||counts.imported<counts.following,
    followsSyncedAt:user?.follows_synced_at||null,workerOnline:Boolean(health&&Date.now()-new Date(health.heartbeat).getTime()<60000),connectedShards:health?.connected_shards||[],checkpoints:checkpoints.map(c=>({shard:c.shard,lastEventAt:c.updated_at})),generation:Number(user?.generation||0)};
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
  const state=await status(pool,fid);
  const fingerprint=createHash('sha256').update(JSON.stringify({...query,generation:state.generation})).digest('hex');
  let page;
  if(cursor){
    try{if(cursor.length>2000)throw 0;page=JSON.parse(Buffer.from(cursor,'base64url').toString());
      if(page.fingerprint!==fingerprint||!/^\d+$/.test(page.ceiling)||!Number.isSafeInteger(page.timestamp)||!/^0x[\da-f]{40}$/.test(page.hash))throw 0;
    }catch{throw new Error('Feed changed or cursor is invalid. Refresh the feed.');}
  }
  const ceiling=page?.ceiling||(await pool.query('SELECT COALESCE(max(id),0)::text AS id FROM freecast_feed_casts')).rows[0].id;
  const params=[fid,ceiling];
  let where='';
  if(mode!=='all'){
    params.push(fids,keys,self);
    const match=`(c.signer=ANY($4::text[]) OR COALESCE(s.requester_fid=ANY($3::bigint[]) OR ($5 AND s.requester_fid=c.author_fid),false))`;
    where+=` AND ${mode==='exclude'?'NOT ':''}${match}`;
  }
  if(page){params.push(page.timestamp,page.hash);where+=` AND (c.timestamp,c.hash) ${order==='newest'?'<':'>'} ($${params.length-1},$${params.length})`;}
  const direction=order==='newest'?'DESC':'ASC';
  const {rows}=await pool.query(`SELECT c.payload,c.timestamp,c.hash FROM freecast_feed_casts c
    JOIN freecast_feed_follows f ON f.author_fid=c.author_fid AND f.viewer_fid=$1
    LEFT JOIN freecast_feed_signers s ON s.author_fid=c.author_fid AND s.signer=c.signer
    WHERE NOT c.deleted AND NOT c.reply AND c.id<=$2 ${where}
    ORDER BY c.timestamp ${direction},c.hash ${direction} LIMIT 31`,params);
  const visible=rows.slice(0,30),last=visible.at(-1);
  const nextPageToken=rows.length>30?Buffer.from(JSON.stringify({fingerprint,ceiling,timestamp:Number(last.timestamp),hash:last.hash})).toString('base64url'):'';
  return {messages:visible.map(row=>row.payload),nextPageToken,status:state};
}
