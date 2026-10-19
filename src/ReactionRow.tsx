import { useEffect, useRef, useState } from 'react';
import type { Config } from './lib/hub';
import type { Reaction } from './lib/social';
import { PersonRow } from './social-ui';
import { ClientLabel } from './ClientLabel';

export function ReactionRow({config,reaction,onProfile}:{config:Config;reaction:Reaction;onProfile:(fid:number)=>void}) {
  const root=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{
    if(visible||!root.current)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'150px'});
    observer.observe(root.current);return()=>observer.disconnect();
  },[visible]);
  return <div className="reaction-row" ref={root}>
    <PersonRow config={config} fid={reaction.data.fid} onProfile={onProfile}/>
    {visible?<ClientLabel config={config} fid={reaction.data.fid} signer={reaction.signer||''} onProfile={onProfile} viaOnly/>:<span className="signer">Resolving client…</span>}
  </div>;
}
