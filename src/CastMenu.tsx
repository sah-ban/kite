import {useEffect,useId,useRef,useState} from 'react';
import {ArrowUpRight,MoreHorizontal,Trash2,Pencil,Link} from 'lucide-react';
import {profile,type Cast,type Config} from './lib/hub';
import {twitterIntent,twitterMediaUrls} from './lib/twitter';
import {castPath} from './lib/social';

function XIcon(){
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"/></svg>;
}

export function CastMenu({config,cast,username,own,busy,onDelete,onEdit,onNotice}:{config:Config;cast:Cast;username?:string;own:boolean;busy:boolean;onDelete:(cast:Cast)=>void;onEdit:(cast:Cast)=>void;onNotice?:(message:string,error?:boolean)=>void}) {
  const [open,setOpen]=useState(false),id=useId();
  const [copying,setCopying]=useState(false);
  const [twitter,setTwitter]=useState<{cast:string;url:string}>();
  const castId=`${cast.data.fid}:${cast.hash}`;
  const root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
  async function copyLink(){
    if(copying)return;setCopying(true);
    const link=new URL(castPath(cast),location.origin).href;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);
      else{
        const field=document.createElement('textarea');field.value=link;field.readOnly=true;field.style.position='fixed';field.style.opacity='0';document.body.append(field);
        try{field.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}finally{field.remove();}
      }
      onNotice?.('Link copied');
    }catch{onNotice?.('Couldn’t copy the link. Please try again.',true);}
    finally{setCopying(false);setOpen(false);toggle.current?.focus();}
  }
  useEffect(()=>{
    if(!open||!own)return;
    let active=true;
    setTwitter(undefined);
    Promise.all([
      Promise.all([...new Set(cast.data.castAddBody.mentions)].map(async fid=>{try{return [fid,await profile(config,fid)] as const;}catch{return [fid,{}] as const;}})),
      twitterMediaUrls(cast),
    ]).then(([entries,media])=>{if(active)setTwitter({cast:castId,url:twitterIntent(cast,Object.fromEntries(entries),media)});});
    return()=>{active=false;};
  },[open,own,config,cast,castId]);
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
      <button role="menuitem" disabled={copying} onClick={()=>void copyLink()}><Link size={15}/>{copying?'Copying…':'Copy link'}</button>
      <a role="menuitem" href={`https://farcaster.xyz/${encodeURIComponent(username||String(cast.data.fid))}/${cast.hash}`} target="_blank" rel="noreferrer" onClick={()=>setOpen(false)}><ArrowUpRight size={15}/>Open in Farcaster</a>
      {own&&(twitter?.cast===castId?<a role="menuitem" href={twitter.url} target="_blank" rel="noopener noreferrer" title="Open an X draft with linked X mentions and regular links. Upload images and videos manually on X." onClick={()=>setOpen(false)}><XIcon/>Post on X</a>:<button role="menuitem" disabled title="Preparing linked X mentions and checking embed types."><XIcon/>Post on X…</button>)}
      {own&&<button role="menuitem" disabled={busy} onClick={()=>{setOpen(false);onEdit(cast);}}><Pencil size={15}/>Edit cast</button>}
      {own&&<button role="menuitem" className="delete-cast" disabled={busy} onClick={()=>{setOpen(false);onDelete(cast);}}><Trash2 size={15}/>Delete cast</button>}
    </div>}
  </div>;
}
