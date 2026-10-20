import { useEffect, useState } from 'react';
import { hub, type Config } from './lib/hub';
import { parseProfileStorage, type ProfileStorageData } from './lib/profile-storage';
import { proExpiryLabel } from './lib/pro';

export function ProfileStorage({config,fid,revision}:{config:Config;fid:number;revision:number}) {
  const [data,setData]=useState<ProfileStorageData>(),[error,setError]=useState(false),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now());
  useEffect(()=>{
    const abort=new AbortController();setData(undefined);setError(false);
    hub(config,'storageLimitsByFid',{fid},abort.signal).then(value=>{if(!abort.signal.aborted){setData(parseProfileStorage(value));setNow(Date.now());}}).catch(()=>{if(!abort.signal.aborted)setError(true);});
    return()=>abort.abort();
  },[config,fid,revision,retry]);
  const expiry=data?.proExpiry,pro=expiry!==undefined&&expiry>now/1000;
  useEffect(()=>{
    if(!pro||expiry===undefined)return;
    const timer=setTimeout(()=>setNow(Date.now()),Math.max(1,Math.min(60_000,expiry*1000-Date.now())));
    return()=>clearTimeout(timer);
  },[pro,expiry,now]);
  const expires=pro?new Date(expiry*1000):undefined;
  const limits=data?.limits.filter(({key})=>['casts','links','reactions'].includes(key))||[];
  return <>
    {expires&&<section className="about-section about-pro" aria-label="Farcaster Pro subscription"><h2>Farcaster Pro</h2><p className="about-pro-remaining">{proExpiryLabel(expiry!,now)}</p><p className="about-status">Expires on <time dateTime={expires.toISOString()}>{expires.toLocaleString(undefined,{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></p></section>}
    <section className="about-section profile-storage" aria-label="Storage usage"><h2>Storage usage</h2>
      {error?<p className="about-status" role="status">Couldn’t load storage usage. <button className="text-button" onClick={()=>setRetry(value=>value+1)}>Retry storage</button></p>:!data?<p className="about-status" role="status">Loading storage usage…</p>:<>
        {data.units!==undefined&&<p className="about-storage-units"><strong>{data.units.toLocaleString()}</strong> storage unit{data.units===1?'':'s'}</p>}
        {limits.length?<div className="storage-limits">{limits.map(({key,label,used,limit})=>{
          const text=`${used.toLocaleString()} / ${limit.toLocaleString()}`;
          return <div className="storage-limit" key={key}><div className="storage-limit-heading"><span>{label}</span><span>{text}</span></div><meter min={0} max={Math.max(1,limit)} value={Math.min(used,Math.max(1,limit))} aria-label={`${label} storage`} aria-valuetext={`${used.toLocaleString()} of ${limit.toLocaleString()} used`}>{text}</meter></div>;
        })}</div>:<p className="about-status">Per-type storage usage isn’t available for this account.</p>}
      </>}
    </section>
  </>;
}
