import { useEffect, useState } from 'react';
import { hub, type Config } from './hub';
import { proSubscriptionExpiry } from './pro';
import { encodeMentionText, type DraftMention } from './mentions';

export type CastLimits={maxEmbeds:number;maxBytes:number;pro:boolean;checking:boolean};
export function useCastLimits(config:Config,fid?:number,revision=0):CastLimits {
  const [record,setRecord]=useState<{fid:number;expiry:number}>(),[clock,setClock]=useState(Date.now);
  useEffect(()=>{
    const abort=new AbortController();setRecord(undefined);setClock(Date.now());
    if(fid)hub(config,'storageLimitsByFid',{fid},abort.signal).then(data=>{if(!abort.signal.aborted)setRecord({fid,expiry:proSubscriptionExpiry(data)});}).catch(()=>{if(!abort.signal.aborted)setRecord({fid,expiry:0});});
    return()=>abort.abort();
  },[config,fid,revision]);
  const expiry=record?.fid===fid?record?.expiry||0:0,pro=expiry>Date.now()/1000;
  useEffect(()=>{
    if(!expiry||expiry*1000<=clock)return;
    const timer=setTimeout(()=>setClock(Date.now()),Math.min(expiry*1000-Date.now()+1,2_147_483_647));return()=>clearTimeout(timer);
  },[expiry,clock]);
  return {maxEmbeds:4,maxBytes:pro?10000:1024,pro,checking:Boolean(fid&&record?.fid!==fid)};
}
export function composerUsage(text:string,mentions:DraftMention[],embeds:number,limits:Pick<CastLimits,'maxEmbeds'|'maxBytes'>):{bytes:number;error:string} {
  let bytes=0;
  try{bytes=new TextEncoder().encode(encodeMentionText(text,mentions).text).length;}catch(error){return {bytes,error:(error as Error).message};}
  if(bytes>limits.maxBytes)return {bytes,error:`Text exceeds the ${limits.maxBytes.toLocaleString()} UTF-8 byte limit.`};
  if(embeds>limits.maxEmbeds)return {bytes,error:`Remove ${embeds-limits.maxEmbeds} embed${embeds-limits.maxEmbeds===1?'':'s'} to fit your account's limit.`};
  return {bytes,error:''};
}
