import {validPushRegistration} from '../push-proof.mjs';

export async function registerPush(pool,fid,key,registration){
  if(!validPushRegistration(registration))throw Object.assign(new Error('Invalid push registration.'),{status:400});
  const {installationId,token,enabled}=registration;
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    // Serialize token rotation, account switches and disabling one installation.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[installationId]);
    if(!enabled){
      await db.query("UPDATE kite_push_devices SET enabled=false,generation=nextval('kite_push_generation'),updated_at=clock_timestamp() WHERE installation_id=$1 AND viewer_fid=$2 AND signer_key=$3",[installationId,fid,key]);
    }else{
      await db.query('DELETE FROM kite_push_devices WHERE token=$1 AND installation_id<>$2',[token,installationId]);
      await db.query(`INSERT INTO kite_push_devices(installation_id,token,viewer_fid,signer_key) VALUES($1,$2,$3,$4)
        ON CONFLICT(installation_id) DO UPDATE SET token=EXCLUDED.token,viewer_fid=EXCLUDED.viewer_fid,signer_key=EXCLUDED.signer_key,enabled=true,
        generation=CASE WHEN kite_push_devices.token<>EXCLUDED.token OR kite_push_devices.viewer_fid<>EXCLUDED.viewer_fid OR NOT kite_push_devices.enabled THEN nextval('kite_push_generation') ELSE kite_push_devices.generation END,
        enabled_at=CASE WHEN kite_push_devices.token<>EXCLUDED.token OR kite_push_devices.viewer_fid<>EXCLUDED.viewer_fid OR NOT kite_push_devices.enabled THEN clock_timestamp() ELSE kite_push_devices.enabled_at END,updated_at=clock_timestamp()`,[installationId,token,fid,key]);
    }
    await db.query('DELETE FROM kite_push_jobs j USING kite_push_devices d WHERE j.installation_id=d.installation_id AND d.installation_id=$1 AND (NOT d.enabled OR j.generation<>d.generation)',[installationId]);
    await db.query('COMMIT');
    return {registered:enabled,fid};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
const messages={mention:['New mention','Someone mentioned you in a cast.'],reply:['New reply','Someone replied to your cast.'],like:['New like','Someone liked your cast.'],recast:['New recast','Someone recast your cast.'],follow:['New follower','Someone followed you.']};
export function pushMessage(row){
  const [title,body]=messages[row.kind];
  return {to:row.token,title,body,sound:'default',channelId:'activity',ttl:3600,data:{type:'kite.activity',viewerFid:Number(row.viewer_fid),notificationId:String(row.notification_id),kind:row.kind,actor:Number(row.actor_fid),...(row.target_hash?{target:{fid:Number(row.target_fid),hash:row.target_hash}}:{})}};
}
export function createPushDelivery(pool,{fetcher=fetch,accessToken='',signal,log=console.warn}={}){
  async function post(endpoint,body){
    const response=await fetcher('https://exp.host/--/api/v2/push/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error('Push provider unavailable ('+response.status+').');
    const value=await response.json();if(value.errors?.length||!value.data)throw new Error('Push provider rejected the request.');return value.data;
  }
  async function disable(row){
    await pool.query("UPDATE kite_push_devices SET enabled=false,generation=nextval('kite_push_generation') WHERE installation_id=$1 AND generation=$2",[row.installation_id,row.generation]);
  }
  async function finish(row){await pool.query('UPDATE kite_push_jobs SET finished_at=now() WHERE id=$1',[row.id]);}
  async function retry(row){
    await pool.query(`UPDATE kite_push_jobs SET attempts=attempts+1,ticket=NULL,sent_at=NULL,next_attempt_at=now()+($2::int*interval '1 second'),finished_at=CASE WHEN attempts>=5 THEN now() ELSE NULL END WHERE id=$1`,[row.id,Math.min(900,30*2**Number(row.attempts))]);
  }
  return async function deliver(){
    // One feed worker holds the database advisory lock. Keep sends outside stream transactions.
    await pool.query(`DELETE FROM kite_push_jobs j WHERE j.created_at<now()-interval '1 day' OR
      NOT EXISTS(SELECT 1 FROM kite_push_devices d WHERE d.installation_id=j.installation_id AND d.enabled AND d.generation=j.generation) OR
      (j.ticket IS NULL AND NOT EXISTS(SELECT 1 FROM kite_notifications n WHERE n.id=j.notification_id))`);
    const rows=(await pool.query(`SELECT j.*,d.token,n.viewer_fid,n.actor_fid,n.kind,n.target_fid,n.target_hash FROM kite_push_jobs j
      JOIN kite_push_devices d ON d.installation_id=j.installation_id AND d.enabled AND d.generation=j.generation
      JOIN kite_notifications n ON n.id=j.notification_id
      WHERE j.finished_at IS NULL AND j.ticket IS NULL AND j.next_attempt_at<=now() AND j.created_at>now()-interval '1 hour'
      ORDER BY j.id LIMIT 50`)).rows;
    // Send separately: Expo batches must belong to the same project, while dev/prod tokens can differ.
    for(const row of rows){
      if(signal?.aborted)return;
      try{
        const active=await pool.query('SELECT 1 FROM kite_push_devices d JOIN kite_notifications n ON n.id=$3 WHERE d.installation_id=$1 AND d.enabled AND d.generation=$2',[row.installation_id,row.generation,row.notification_id]);
        if(!active.rows.length){await finish(row);continue;}
        const tickets=await post('send',[pushMessage(row)]),ticket=tickets[0];
        if(ticket?.status==='ok'&&typeof ticket.id==='string')await pool.query("UPDATE kite_push_jobs SET ticket=$2,sent_at=now(),next_attempt_at=now()+interval '15 minutes' WHERE id=$1",[row.id,ticket.id]);
        else if(ticket?.details?.error==='DeviceNotRegistered'){await disable(row);await finish(row);}
        else if(['MessageTooBig','InvalidCredentials','MismatchSenderId'].includes(ticket?.details?.error)){log('Push delivery rejected: '+ticket.details.error);await finish(row);}
        else await retry(row);
      }catch(error){if(signal?.aborted)return;await retry(row);log('Push delivery failed; retry scheduled.');}
    }
    const receipts=(await pool.query(`SELECT j.* FROM kite_push_jobs j JOIN kite_push_devices d ON d.installation_id=j.installation_id AND d.enabled AND d.generation=j.generation WHERE j.finished_at IS NULL AND j.ticket IS NOT NULL AND j.next_attempt_at<=now() ORDER BY j.id LIMIT 100`)).rows;
    if(!receipts.length)return;
    const result=await post('getReceipts',{ids:receipts.map(row=>row.ticket)});
    for(const row of receipts){
      const receipt=result[row.ticket];
      if(!receipt){await pool.query("UPDATE kite_push_jobs SET next_attempt_at=now()+interval '15 minutes' WHERE id=$1",[row.id]);continue;}
      if(receipt.details?.error==='MessageRateExceeded'){await retry(row);continue;}
      if(receipt.details?.error==='DeviceNotRegistered')await disable(row);
      else if(receipt.status==='error')log('Push receipt reported a delivery error.');
      await finish(row);
    }
  };
}
