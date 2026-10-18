import { ProBadge } from './ProBadge';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { profile, subscribeProfiles, getProfileVersion, type Config, type Profile } from './lib/hub';

export function useProfile(config:Config,fid:number) {
  const revision=useSyncExternalStore(subscribeProfiles,getProfileVersion);
  const [person,setPerson]=useState<Profile>();
  useEffect(()=>{let active=true;setPerson(undefined);if(fid>0)profile(config,fid).then(p=>{if(active)setPerson(p);}).catch(()=>{});return()=>{active=false;};},[config,fid,revision]);
  return person;
}
export function Avatar({person}:{person?:Profile}) {
  const [broken,setBroken]=useState(false);
  useEffect(()=>setBroken(false),[person?.avatar]);
  return <div className="avatar">{person?.avatar&&!broken?<img src={person.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>:<span>{(person?.name||'F').slice(0,1).toUpperCase()}</span>}</div>;
}
export function PersonRow({config,fid,onProfile}:{config:Config;fid:number;onProfile:(fid:number)=>void}) {
  const p=useProfile(config,fid);
  return <button className="person-row" onClick={()=>onProfile(fid)}><Avatar person={p}/><span><strong>{p?.name||`FID ${fid}`} <ProBadge config={config} fid={fid}/></strong><small>{p?.username?`@${p.username}`:`FID ${fid}`}</small>{p?.bio&&<span className="person-bio">{p.bio}</span>}</span><span className="person-arrow" aria-hidden="true">↗</span></button>;
}
