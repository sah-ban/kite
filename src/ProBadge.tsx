import { useEffect, useState } from 'react';
import type { Config } from './lib/hub';
import { cachedProExpiry, proExpiryLabel } from './lib/pro';
export function ProBadge({config,fid,visible=true}:{config:Config;fid:number;visible?:boolean}) {
  const [status,setStatus]=useState<{fid:number;config:Config;expiresAt:number;now:number}>();
  useEffect(()=>{
    if(!visible||fid<=0)return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const read=async()=>{
      let expiry=0;try{expiry=await cachedProExpiry(config,fid);}catch{/* An unavailable status never grants a badge. */}
      if(!active)return;
      const now=Date.now();setStatus({fid,config,expiresAt:expiry,now});
      timer=setTimeout(read,expiry>now/1000?Math.min(300_000,Math.max(1000,expiry*1000-now)):300_000);
    };
    void read();return()=>{active=false;clearTimeout(timer);};
  },[config,fid,visible]);
  if(!visible||status?.fid!==fid||status.config!==config||status.expiresAt<=status.now/1000)return null;
  const title=proExpiryLabel(status.expiresAt,status.now);
  return <span className="pro-badge" role="img" tabIndex={0} title={title} aria-label={`Farcaster Pro. ${title}`} onMouseEnter={()=>setStatus({...status,now:Date.now()})} onFocus={()=>setStatus({...status,now:Date.now()})}>PRO</span>;
}
