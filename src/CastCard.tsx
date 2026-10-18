import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { castDate, type Cast, type Config } from './lib/hub';
import { castPath, countLabel, readActivity, type Activity, type ActivityTab } from './lib/social';
import { ClientLabel } from './ClientLabel';
import { Avatar, useProfile } from './social-ui';

export type CastHandlers = {
  onProfile:(fid:number)=>void;
  onOpen:(cast:Cast,tab?:ActivityTab)=>void;
  onReply:(cast:Cast)=>void;
  onReact:(cast:Cast,kind:'like'|'recast',remove:boolean)=>void;
};
export function CastCard({config,cast,handlers,revision=0,sessionFid,busy=false,detailed=false,activity:provided}: {
  config:Config;cast:Cast;handlers:CastHandlers;revision?:number;sessionFid?:number;busy?:boolean;detailed?:boolean;activity?:Activity;
}) {
  const person=useProfile(config,cast.data.fid), root=useRef<HTMLElement>(null);
  const [visible,setVisible]=useState(detailed),[loaded,setLoaded]=useState<Activity>();
  useEffect(()=>{
    if(visible||!root.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});
    observer.observe(root.current);return()=>observer.disconnect();
  },[visible]);
  useEffect(()=>{let active=true;setLoaded(undefined);if(visible&&!provided)readActivity(config,cast,revision).then(value=>{if(active)setLoaded(value);});return()=>{active=false;};},[config,cast,revision,visible,provided]);
  const activity=provided||loaded;
  const liked=Boolean(sessionFid&&activity?.likes?.items.some(m=>m.data.fid===sessionFid));
  const recast=Boolean(sessionFid&&activity?.recasts?.items.some(m=>m.data.fid===sessionFid));
  const count=(tab:ActivityTab)=>activity?countLabel(activity[tab]):'…';
  const characters=Array.from(cast.data.castAddBody.text),truncated=!detailed&&characters.length>600;
  return <article ref={root} className={`cast${detailed?' cast-expanded':''}`}>
    <button className="avatar-link" aria-label={`Open ${person?.name||`FID ${cast.data.fid}`} profile`} onClick={()=>handlers.onProfile(cast.data.fid)}><Avatar person={person}/></button>
    <div className="cast-main">
      <div className="cast-header"><button className="author" onClick={()=>handlers.onProfile(cast.data.fid)}>{person?.name||`FID ${cast.data.fid}`}</button><span className="username">{person?.username?`@${person.username}`:`#${cast.data.fid}`}</span><a className="cast-date" href={castPath(cast)} onClick={e=>{e.preventDefault();handlers.onOpen(cast);}}><time dateTime={castDate(cast.data.timestamp).toISOString()} title={castDate(cast.data.timestamp).toLocaleString()}>{castDate(cast.data.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></a><a aria-label="Open cast on Farcaster" href={`https://farcaster.xyz/${person?.username||cast.data.fid}/${cast.hash}`} target="_blank" rel="noreferrer"><ArrowUpRight size={15}/></a></div>
      {cast.data.castAddBody.parentCastId&&<div className="reply-context">Reply to FID {cast.data.castAddBody.parentCastId.fid}</div>}
      {detailed?<p className="cast-text">{cast.data.castAddBody.text}</p>:<a className="cast-text cast-permalink" href={castPath(cast)} onClick={e=>{e.preventDefault();handlers.onOpen(cast);}}>{truncated?characters.slice(0,600).join('').trimEnd()+'…':cast.data.castAddBody.text}{truncated&&<span className="read-full">Read full cast →</span>}</a>}
      {cast.data.castAddBody.embeds?.filter(e=>e.url&&/^https?:\/\//.test(e.url)).map((e,i)=><a className="embed-link" href={e.url} key={i} target="_blank" rel="noreferrer">{e.url}</a>)}
      {cast.data.castAddBody.embeds?.filter(e=>e.castId).map((e,i)=><button key={i} className="quoted-cast" onClick={()=>handlers.onOpen({hash:e.castId!.hash,data:{fid:e.castId!.fid}} as Cast)}>View quoted cast <ArrowUpRight size={13}/></button>)}
      {detailed&&<div className="cast-timestamp">{castDate(cast.data.timestamp).toLocaleString()}</div>}
      <div className="cast-actions">
        <button title="View replies" aria-label={`View replies (${count('replies')})`} onClick={()=>handlers.onOpen(cast,'replies')}><MessageCircle size={17}/><span>{count('replies')}</span></button>
        <div className="reaction-group"><button title={recast?'Undo recast':'Recast'} aria-label={recast?'Undo recast':'Recast cast'} aria-pressed={recast} disabled={busy} onClick={()=>handlers.onReact(cast,'recast',recast)}><Repeat2 size={17}/></button><button className="reaction-count" aria-label={`View recasts (${count('recasts')})`} onClick={()=>handlers.onOpen(cast,'recasts')}>{count('recasts')}</button></div>
        <div className="reaction-group"><button title={liked?'Unlike':'Like'} aria-label={liked?'Unlike cast':'Like cast'} aria-pressed={liked} disabled={busy} onClick={()=>handlers.onReact(cast,'like',liked)}><Heart size={17}/></button><button className="reaction-count" aria-label={`View likes (${count('likes')})`} onClick={()=>handlers.onOpen(cast,'likes')}>{count('likes')}</button></div>
        <button className="reply-action" onClick={()=>handlers.onReply(cast)}>Reply</button>
        <ClientLabel config={config} fid={cast.data.fid} signer={cast.signer}/>
      </div>
    </div>
  </article>;
}
