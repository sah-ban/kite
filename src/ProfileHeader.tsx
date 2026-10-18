import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { type Config } from './lib/hub';
import { countLabel, readConnections, type Page } from './lib/social';
import { Avatar, useProfile } from './social-ui';

export function ProfileHeader({config,fid,onConnections,onFollow,followed,busy,ownProfile,revision}: {
  config:Config;fid:number;onConnections:(kind:'followers'|'following')=>void;onFollow:()=>void;followed:boolean;busy:boolean;ownProfile:boolean;revision:number;
}) {
  const person=useProfile(config,fid);
  const [pages,setPages]=useState<Partial<Record<'followers'|'following',Page<number>>>>({}),[errors,setErrors]=useState<Partial<Record<'followers'|'following',string>>>({});
  useEffect(()=>{let active=true;setPages({});setErrors({});for(const kind of ['followers','following'] as const)readConnections(config,fid,kind).then(page=>{if(active)setPages(value=>({...value,[kind]:page}));}).catch(error=>{if(active)setErrors(value=>({...value,[kind]:(error as Error).message}));});return()=>{active=false;};},[config,fid,revision]);
  return <>
    <section className="profile-hero" aria-label="Profile">
      <div className="profile-cover"><span>YOUR CORNER OF THE NETWORK</span></div>
      <div className="profile-top"><Avatar person={person}/>{!ownProfile&&<button className="button small-button" disabled={busy} onClick={onFollow}>{followed?'Unfollow':'Follow'}</button>}</div>
      <h2>{person?.name||`FID ${fid}`}</h2><div className="profile-handle">{person?.username?`@${person.username}`:`FID ${fid}`} <span>· FID {fid}</span></div>
      {person?.bio&&<p className="profile-bio">{person.bio}</p>}
      <div className="profile-meta">{(['following','followers'] as const).map(kind=><button key={kind} title={errors[kind]?'Count unavailable. Open list to retry.':undefined} onClick={()=>onConnections(kind)}><strong>{countLabel(pages[kind])}</strong> {kind[0].toUpperCase()+kind.slice(1)}</button>)}<a href={`https://farcaster.xyz/${person?.username||fid}`} target="_blank" rel="noreferrer">Farcaster <ArrowUpRight size={12}/></a></div>
    </section>

  </>;
}
