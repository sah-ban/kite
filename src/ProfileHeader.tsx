import { JoinedDate } from './JoinedDate';
import { ProfileCounts } from './ProfileCounts';
import { ProBadge } from './ProBadge';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { type Config } from './lib/hub';
import { followsAccount } from './lib/social';
import { Avatar, useProfile } from './social-ui';
import { embedURL } from './lib/embeds';

function ProfileCover({banner}:{banner?:string}) {
  const src=banner?embedURL(banner):undefined;
  const [failedSrc,setFailedSrc]=useState<string>();
  return <div className="profile-cover">{src&&failedSrc!==src?<img key={src} src={src} alt="Profile banner" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedSrc(src)}/>:<span>YOUR CORNER OF THE NETWORK</span>}</div>;
}

export function ProfileHeader({config,fid,viewerFid,onConnections,onFollow,followed,busy,ownProfile,revision,onEdit,onAbout}: {
  config:Config;fid:number;viewerFid?:number;onConnections:(kind:'followers'|'following')=>void;onFollow:()=>void;followed:boolean;busy:boolean;ownProfile:boolean;revision:number;onEdit:()=>void;onAbout:()=>void;
}) {
  const person=useProfile(config,fid);
  const [relationship,setRelationship]=useState<{fid:number;viewerFid:number;follows:boolean}>();
  useEffect(()=>{
    const controller=new AbortController();setRelationship(undefined);
    if(viewerFid&&viewerFid!==fid)followsAccount(config,fid,viewerFid,controller.signal).then(follows=>{if(!controller.signal.aborted)setRelationship({fid,viewerFid,follows});}).catch(()=>{});
    return()=>controller.abort();
  },[config,fid,viewerFid,revision]);
  const followsYou=Boolean(viewerFid&&viewerFid!==fid&&relationship?.fid===fid&&relationship.viewerFid===viewerFid&&relationship.follows);
  return <>
    <section className="profile-hero" aria-label="Profile">
      <ProfileCover banner={person?.banner}/>
      <div className="profile-top"><Avatar person={person}/>{ownProfile&&<button className="button small-button" onClick={onEdit}>Edit profile</button>}{!ownProfile&&<button className="button small-button" disabled={busy} onClick={onFollow}>{followed?'Unfollow':'Follow'}</button>}</div>
      <h2>{person?.name||`FID ${fid}`} <ProBadge config={config} fid={fid}/></h2><div className="profile-handle">{person?.username?`@${person.username}`:`FID ${fid}`} <span>· FID {fid}</span>{followsYou&&<span className="follows-you">Follows you</span>}<a className="profile-about-link" href={`/profile/${fid}/about`} onClick={event=>{event.preventDefault();onAbout();}}>About →</a></div>
      {person?.bio&&<p className="profile-bio">{person.bio}</p>}
      <div className="profile-info"><JoinedDate fid={fid} revision={revision}/>{person?.website&&embedURL(person.website)&&<a className="profile-website" href={embedURL(person.website)} target="_blank" rel="noreferrer"><span>{person.website}</span><ArrowUpRight size={12}/></a>}</div>
      <div className="profile-meta"><ProfileCounts config={config} fid={fid} revision={revision} onConnections={onConnections}/><a href={`https://farcaster.xyz/${person?.username||fid}`} target="_blank" rel="noreferrer">Farcaster <ArrowUpRight size={12}/></a></div>
    </section>

  </>;
}
