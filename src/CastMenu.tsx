import {useEffect,useId,useRef,useState} from 'react';
import {ArrowUpRight,MoreHorizontal,Trash2,Pencil,Twitter} from 'lucide-react';
import {profile,type Cast,type Config} from './lib/hub';
import {twitterIntent} from './lib/twitter';

export function CastMenu({config,cast,username,own,busy,onDelete,onEdit}:{config:Config;cast:Cast;username?:string;own:boolean;busy:boolean;onDelete:(cast:Cast)=>void;onEdit:(cast:Cast)=>void}) {
  const [open,setOpen]=useState(false),id=useId();
  const [mentionNames,setMentionNames]=useState<Record<number,string>>({});
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    Promise.all([...new Set(cast.data.castAddBody.mentions)].map(async fid=>{try{return [fid,(await profile(config,fid)).username] as const;}catch{return [fid,''] as const;}})).then(entries=>{if(active)setMentionNames(Object.fromEntries(entries));});
    return()=>{active=false;};
  },[open,config,cast]);
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  return <div className="cast-menu" ref={root} onClick={event=>event.stopPropagation()} onKeyDown={event=>{
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);toggle.current?.focus();}
    if(event.key==='Tab')setTimeout(()=>setOpen(false),0);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!open){setOpen(true);return;}
      const items=Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')||[]);
      const current=items.indexOf(document.activeElement as HTMLElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={toggle} className="cast-menu-toggle" aria-label="Cast options" title="Cast options" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}><MoreHorizontal size={18}/></button>
    {open&&<div className="cast-menu-items" id={id} role="menu" aria-label="Cast options">
      <a role="menuitem" href={`https://farcaster.xyz/${encodeURIComponent(username||String(cast.data.fid))}/${cast.hash}`} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}><ArrowUpRight size={15}/>Open in Farcaster</a>
      <a role="menuitem" href={twitterIntent(cast,mentionNames)} target="_blank" rel="noopener noreferrer" title="Open a Twitter draft. Upload images and videos manually on Twitter." onClick={()=>setOpen(false)}><Twitter size={15}/>Post to Twitter</a>
      {own&&<button role="menuitem" disabled={busy} onClick={()=>{setOpen(false);onEdit(cast);}}><Pencil size={15}/>Edit cast</button>}
      {own&&<button role="menuitem" className="delete-cast" disabled={busy} onClick={()=>{setOpen(false);onDelete(cast);}}><Trash2 size={15}/>Delete cast</button>}
    </div>}
  </div>;
}
