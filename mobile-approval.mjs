import {createPublicKey,verify} from 'node:crypto';
import {bytesToHex,hexToBytes} from 'viem';
import {ViemLocalEip712Signer} from '@farcaster/core';
import {loadApprovalIdentity,verifyRegistration,RegistrationPending} from './approval.mjs';
import {writeOrigin} from './origin.mjs';
import {pushClaim,validPushRegistration} from './push-proof.mjs';
import {mobileClaim} from './mobile-proof.mjs';

export function mobileApproval(config,{fetcher=fetch,now=Date.now,identity=()=>loadApprovalIdentity(config),check=(fid,key)=>verifyRegistration(config,fid,key,fetcher),enrollFeed,registerPush}={}){
  const starts=new Map(),rates=new Map();
  function fail(status,message){const error=new Error(message);error.status=status;throw error;}
  function limit(req,purpose){
    for(const [key,rate] of rates)if(rate.until<=now())rates.delete(key);
    const key=`${req.socket?.remoteAddress||'unknown'}:${purpose}`;
    if(!rates.has(key)&&rates.size>=5000)fail(429,'Too many requests. Please try again later.');
    const rate=rates.get(key)||{count:0,until:now()+(purpose==='approve'?3600000:60000)};
    if(rate.count>=(purpose==='approve'?10:120))fail(429,'Too many requests. Please try again later.');
    rate.count++;rates.set(key,rate);
  }
  return async(req,res,next)=>{
    const path=new URL(req.url||'/','http://localhost').pathname;
    if(!path.startsWith('/api/mobile/'))return next();
    const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
    try{
      if(!['/api/mobile/approval','/api/mobile/verify','/api/mobile/feed','/api/mobile/push'].includes(path))return send(404,{error:'Unknown account endpoint.'});
      if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Use POST for account requests.'});}
      const origin=writeOrigin(req,config);
      if(req.headers.host!==origin.host||origin.protocol!=='https:'||req.headers.origin&&req.headers.origin!==origin.origin)fail(403,'Invalid account request origin.');
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>2048)fail(413,'Request too large.');chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid account request.');}
      const purpose=path.endsWith('/approval')?'approve':path.endsWith('/feed')?'feed':path.endsWith('/push')?'push':'verify';
      if(!body||typeof body!=='object'||Object.keys(body).some(key=>!['key','issuedAt','nonce','signature',...(purpose!=='approve'?['fid']:[]),...(purpose==='push'?['registration']:[])].includes(key))||
        !/^0x[a-f0-9]{64}$/.test(body.key||'')||!/^0x[a-f0-9]{128}$/.test(body.signature||'')||! /^[a-f0-9]{32}$/.test(body.nonce||'')||
        !Number.isSafeInteger(body.issuedAt)||Math.abs(Math.floor(now()/1000)-body.issuedAt)>120||
        purpose!=='approve'&&(!Number.isSafeInteger(body.fid)||body.fid<=0))fail(400,'Invalid or expired account request.');
      if(purpose==='push'&&!validPushRegistration(body.registration))fail(400,'Invalid push registration.');
      const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(body.key.slice(2),'hex')]),format:'der',type:'spki'});
      if(!verify(null,purpose==='push'?pushClaim(origin.origin,body.key,body.issuedAt,body.nonce,body.fid,body.registration):mobileClaim(origin.origin,purpose,body.key,body.issuedAt,body.nonce,body.fid||0),publicKey,Buffer.from(body.signature.slice(2),'hex')))fail(403,'Could not verify app key ownership.');
      if(purpose!=='approve'){
        limit(req,purpose);
        try{
          // A revoked key can still disable its own installation on sign-out.
          if(purpose==='push'&&!body.registration.enabled){
            if(!registerPush)fail(503,'Push notifications are not configured.');
            return send(200,await registerPush(body.fid,body.key,body.registration));
          }
          const address=await check(body.fid,body.key);
          if(purpose==='push'){
            if(!registerPush||!enrollFeed)fail(503,'Push notifications are not configured.');
            await enrollFeed(body.fid);
            return send(200,await registerPush(body.fid,body.key,body.registration));
          }
          if(purpose==='feed'){
            if(!enrollFeed)fail(503,'Indexed notifications are not configured.');
            return send(200,await enrollFeed(body.fid));
          }
          return send(200,{state:'active',fid:body.fid,key:body.key,address});
        }
        catch(error){if(error instanceof RegistrationPending)return send(200,{state:'pending'});if(error.status===403)fail(403,'This account connection is inactive. Sign in again.');throw error;}
      }
      for(const [nonce,entry] of starts)if(entry.until<=now())starts.delete(nonce);
      const replay=starts.get(body.nonce);
      if(replay){if(replay.key!==body.key)fail(403,'Invalid account request.');return send(200,await replay.value);}
      limit(req,purpose);if(starts.size>=1000)fail(429,'Too many sign-in requests. Please try again later.');
      const entry={key:body.key,until:now()+120000,value:undefined};
      entry.value=(async()=>{
        let app;try{app=await identity();}catch{fail(503,'Sign-in is temporarily unavailable. Please try again.');}
        const deadline=Math.floor(now()/1000)+15*60;
        const signed=await new ViemLocalEip712Signer(app.account).signKeyRequest({requestFid:BigInt(app.fid),key:hexToBytes(body.key),deadline:BigInt(deadline)});
        if(signed.isErr())fail(503,'Sign-in is temporarily unavailable.');
        const response=await fetcher('https://api.farcaster.xyz/v2/signed-key-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:body.key,signature:bytesToHex(signed.value),requestFid:app.fid,deadline}),signal:AbortSignal.timeout(20000),redirect:'error'});
        if(!response.ok)fail(502,'Farcaster could not create an approval. Please try again.');
        const request=(await response.json())?.result?.signedKeyRequest;
        let link;try{link=new URL(request?.deeplinkUrl);}catch{fail(502,'Farcaster returned an invalid approval link.');}
        if(!['farcaster:','warpcast:','https:'].includes(link.protocol)||link.username||link.password||link.protocol==='https:'&&!['farcaster.xyz','www.farcaster.xyz','warpcast.com','www.warpcast.com'].includes(link.hostname)||typeof request?.token!=='string'||!request.token||request.token.length>500)fail(502,'Farcaster returned an invalid approval.');
        return {key:body.key,token:request.token,deepLinkUrl:link.href,appFid:app.fid,expiresAt:deadline*1000};
      })().catch(error=>{if(starts.get(body.nonce)===entry)starts.delete(body.nonce);throw error;});
      starts.set(body.nonce,entry);return send(200,await entry.value);
    }catch(error){const status=[400,403,413,429,502,503].includes(error.status)?error.status:503;send(status,{error:error.status===status?error.message:'Sign-in is temporarily unavailable. Please try again.'});}
  };
}
