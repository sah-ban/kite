import {hubUrl} from '../node-config.mjs';
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {writeOrigin} from '../origin.mjs';
import {validFid} from './store.mjs';
export function localFeedEnrollment(config,enroll,{fetcher=fetch,now=Date.now}={}) {
  const challenges=new Map(),rates=new Map();
  function fail(status,message){const error=new Error(message);error.status=status;throw error;}
  async function registered(fid,key){
    let token='';const seen=new Set();
    do{
      const url=new URL('/v1/signersByFid',config.FREECAST_FEED_HTTP_URL||hubUrl(config));
      url.search=new URLSearchParams({fid:String(fid),pageSize:'100',...(token?{pageToken:token}:{})}).toString();
      const response=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error'});if(!response.ok)fail(502,'Could not verify the app key. Please retry.');
      const page=await response.json();if(!Array.isArray(page.signers))fail(502,'Could not verify the app key. Please retry.');
      const signer=page.signers.find(s=>Number(s.fid)===fid&&s.key?.toLowerCase()===key&&s.keyType===1);
      if(signer){
        const offchain=signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN';
        const onchain=signer.source===1||signer.source==='SIGNER_SOURCE_ONCHAIN';
        if(onchain)return;
        if(offchain&&Number(signer.expiresAt)>now()/1000&&(signer.scopes?.includes(1)||signer.scopes?.includes('MESSAGE_TYPE_CAST_ADD')))return;
        fail(403,'This app key is expired or cannot enroll this FID.');
      }
      token=page.nextPageToken||'';if(token&&seen.has(token))fail(502,'Could not verify the app key. Please retry.');seen.add(token);
    }while(token);
    fail(403,'This app key is not registered for this FID.');
  }
  return async(req,res,url)=>{
    const origin=writeOrigin(req,config),localHost=['localhost','127.0.0.1','[::1]'].includes(origin.hostname),localPeer=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    if(!localHost||!localPeer||origin.host!==req.headers.host)fail(403,'Use delegated account approval to enroll a hosted account.');
    if(req.headers.origin&&req.headers.origin!==origin.origin)fail(403,'Origin mismatch.');
    for(const [nonce,record]of challenges)if(record.expires<=now())challenges.delete(nonce);
    for(const [ip,record]of rates)if(record.expires<=now())rates.delete(ip);
    if(url.pathname==='/api/feed/challenge'){
      if(req.method!=='GET')fail(405,'Method not allowed');
      const fid=Number(url.searchParams.get('fid')),key=(url.searchParams.get('key')||'').toLowerCase();
      if(!validFid(fid)||!/^0x[\da-f]{64}$/.test(key))fail(400,'Invalid account or public key');
      const ip=req.socket.remoteAddress,rate=rates.get(ip)||{count:0,expires:now()+60000};
      if(rate.count>=10||challenges.size>=1000)fail(429,'Too many enrollment requests. Please retry later.');rate.count++;rates.set(ip,rate);
      const nonce=randomBytes(24).toString('hex'),expires=now()+120000;
      const message=`Kite feed enrollment\nOrigin: ${origin.origin}\nFID: ${fid}\nApp key: ${key}\nNonce: ${nonce}\nExpires: ${expires}`;
      challenges.set(nonce,{fid,key,expires,message,origin:origin.origin});return {nonce,message};
    }
    if(req.method!=='POST')fail(405,'Method not allowed');
    if(req.headers.origin!==origin.origin)fail(403,'Origin mismatch.');
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2048)fail(413,'Enrollment request too large');chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid JSON');}
    if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid JSON');
    const record=challenges.get(body.nonce);if(!record||record.origin!==origin.origin)fail(403,'Enrollment challenge expired. Please retry.');
    challenges.delete(body.nonce);
    if(!/^0x[\da-f]{128}$/i.test(body.signature||''))fail(403,'Invalid enrollment signature');
    const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(record.key.slice(2),'hex')]),format:'der',type:'spki'});
    if(!verify(null,createHash('sha256').update(record.message).digest(),publicKey,Buffer.from(body.signature.slice(2),'hex')))fail(403,'Invalid enrollment signature');
    await registered(record.fid,record.key);
    return enroll(record.fid);
  };
}
