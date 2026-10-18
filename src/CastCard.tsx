import { ProBadge } from './ProBadge';
import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Repeat2, Quote } from 'lucide-react';
import { type Cast, type Config } from './lib/hub';
import { castPath, countLabel, readActivity, type Activity, type ActivityTab } from './lib/social';
import { ClientLabel } from './ClientLabel';
import { Avatar, useProfile } from './social-ui';
import { QuotedCast } from './QuotedCast';
import { CastEmbeds } from './CastEmbeds';
import { CastText } from './CastText';
import { CastMenu } from './CastMenu';
import { CastTime } from './CastTime';

export type CastHandlers = {
  onProfile:(fid:number)=>void;
  onOpen:(cast:Cast,tab?:ActivityTab)=>void;
  onReply:(cast:Cast)=>void;
  onDelete:(cast:Cast)=>void;
  onQuote:(cast:Cast)=>void;
  onReact:(cast:Cast,kind:'like'|'recast',remove:boolean)=>void;
};
export function CastCard({config,cast,handlers,revision=0,sessionFid,busy=false,detailed=false,activity:provided}: {
  config:Config;cast:Cast;handlers:CastHandlers;revision?:number;sessionFid?:number;busy?:boolean;detailed?:boolean;activity?:Activity;
}) {
  const person=useProfile(config,cast.data.fid), root=useRef<HTMLElement>(null);
  const parentFid=cast.data.castAddBody.parentCastId?.fid;
  const parentPerson=useProfile(config,parentFid||0);
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
  return <article ref={root} className={`cast${detailed?' cast-expanded':' cast-interactive'}`} tabIndex={detailed?undefined:0} aria-label={detailed?undefined:`Cast by ${person?.name||`FID ${cast.data.fid}`}. Press Enter to open conversation.`} onClick={event=>{
    if(detailed||event.defaultPrevented||event.button!==0)return;
    const target=event.target as HTMLElement;
    if(target.closest('a,button,input,textarea,select,video,audio,iframe,[role="button"],[role="link"],[contenteditable],.quote-preview,.modal-backdrop,.cast-menu'))return;
    if(window.getSelection()?.toString())return;
    handlers.onOpen(cast);
  }} onKeyDown={event=>{
    if(!detailed&&event.target===event.currentTarget&&event.key==='Enter'){event.preventDefault();handlers.onOpen(cast);}
  }}>
    <button className="avatar-link" aria-label={`Open ${person?.name||`FID ${cast.data.fid}`} profile`} onClick={()=>handlers.onProfile(cast.data.fid)}><Avatar person={person}/></button>
    <div className="cast-main">
      <div className="cast-header"><button className="author" onClick={()=>handlers.onProfile(cast.data.fid)}>{person?.name||`FID ${cast.data.fid}`} <ProBadge config={config} fid={cast.data.fid} visible={visible}/></button><span className="username">{person?.username?`@${person.username}`:`#${cast.data.fid}`}</span><a className="cast-date" href={castPath(cast)} onClick={e=>{e.preventDefault();handlers.onOpen(cast);}}><CastTime timestamp={cast.data.timestamp} full={detailed}/></a><CastMenu cast={cast} username={person?.username} own={sessionFid===cast.data.fid} busy={busy} onDelete={handlers.onDelete}/></div>
      {parentFid&&<div className="reply-context">Replying to <button type="button" className="reply-profile" onClick={()=>handlers.onProfile(parentFid)}>{parentPerson?.username?`@${parentPerson.username}`:`FID ${parentFid}`}</button></div>}
      <CastText config={config} cast={cast} visible={visible} onProfile={handlers.onProfile} onOpen={detailed?undefined:handlers.onOpen} limit={detailed?undefined:600}/>
      <CastEmbeds urls={cast.data.castAddBody.embeds?.flatMap(e=>e.url?[e.url]:[])||[]} visible={visible}/>
      {cast.data.castAddBody.embeds?.filter(e=>e.castId).map((e,i)=><QuotedCast key={`${e.castId!.fid}:${e.castId!.hash}:${i}`} config={config} fid={e.castId!.fid} hash={e.castId!.hash} visible={visible} onOpen={handlers.onOpen} onProfile={handlers.onProfile}/>)}
      <div className="cast-actions">
        <div className="reaction-group"><button title="Reply to cast" aria-label="Reply to cast" onClick={()=>handlers.onReply(cast)}><MessageCircle size={17}/></button><button className="reaction-count" aria-label={`View replies (${count('replies')})`} onClick={()=>handlers.onOpen(cast,'replies')}>{count('replies')}</button></div>
        <button title="Quote cast" aria-label="Quote cast" onClick={()=>handlers.onQuote(cast)}><Quote size={17}/></button>
        <div className="reaction-group"><button title={recast?'Undo recast':'Recast'} aria-label={recast?'Undo recast':'Recast cast'} aria-pressed={recast} disabled={busy} onClick={()=>handlers.onReact(cast,'recast',recast)}><Repeat2 size={17}/></button><button className="reaction-count" aria-label={`View recasts (${count('recasts')})`} onClick={()=>handlers.onOpen(cast,'recasts')}>{count('recasts')}</button></div>
        <div className="reaction-group"><button title={liked?'Unlike':'Like'} aria-label={liked?'Unlike cast':'Like cast'} aria-pressed={liked} disabled={busy} onClick={()=>handlers.onReact(cast,'like',liked)}><Heart size={17}/></button><button className="reaction-count" aria-label={`View likes (${count('likes')})`} onClick={()=>handlers.onOpen(cast,'likes')}>{count('likes')}</button></div>
        <ClientLabel config={config} fid={cast.data.fid} signer={cast.signer} onProfile={handlers.onProfile}/>
      </div>
    </div>
  </article>;
}
