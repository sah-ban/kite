import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Github, LogOut, Settings, UserRound, KeyRound, Menu, MessageSquareQuote } from 'lucide-react';
import type { Profile } from './lib/hub';
import type { Session } from './lib/signing';
import { Avatar } from './social-ui';

export function AccountMenu({session,person,menuIcon=false,onGuide,onSettings,onConnect,onLock}:{session:Session|null;person?:Profile;menuIcon?:boolean;onGuide?:()=>void;onSettings:()=>void;onConnect:()=>void;onLock:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[locking,setLocking]=useState(false),root=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null),id=useId();
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[open]);
  function select(action:()=>void){setOpen(false);action();}
  return <div className="account-menu" ref={root} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();setOpen(false);toggle.current?.focus();}
    if(event.key==='Tab')setOpen(false);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();if(!open){setOpen(true);return;}
      const items=Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')||[]),current=items.indexOf(document.activeElement as HTMLElement);
      const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[next]?.focus();
    }
  }}>
    <button ref={toggle} className="account-menu-toggle" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}>
      {menuIcon?<Menu size={22}/>:<>{session?<Avatar person={person}/>:<UserRound size={21}/>}
      <span>{session?(person?.username?`@${person.username}`:person?.name||'Your account'):'Account'}</span><ChevronDown size={14}/></>}
    </button>
    {open&&<div id={id} className="account-menu-items" role="menu" aria-label="Your account">
      {session&&<div className="account-menu-identity"><strong>{person?.name||'Your account'}</strong><small>{person?.username?`@${person.username}`:`FID ${session.fid}`}</small></div>}
      {!session&&<button role="menuitem" onClick={()=>select(onConnect)}><KeyRound size={18}/>Connect account</button>}
      <button role="menuitem" onClick={()=>select(onSettings)}><Settings size={18}/>Settings</button>
      {onGuide&&<>
        <a role="menuitem" href="/guide" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();select(onGuide);}}><BookOpen size={18}/>Guide</a>
        <a role="menuitem" href="/endorsements"><MessageSquareQuote size={18}/>Endorsements</a>
        <a role="menuitem" href="https://github.com/sah-ban/kite" target="_blank" rel="noopener noreferrer" onClick={()=>setOpen(false)}><Github size={18}/>GitHub</a>
      </>}
      {session&&<button role="menuitem" disabled={locking} onClick={async()=>{setLocking(true);try{await onLock();setOpen(false);}finally{setLocking(false);}}}><LogOut size={18}/>{locking?'Disconnecting…':session.remote?'Sign out':'Lock account'}</button>}
    </div>}
  </div>;
}
