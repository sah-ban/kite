import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
export function Code({children, label}: {children:string;label?:string}) {
  const [copied,setCopied] = useState(false);
  return <div className="code"><div className="code-label"><span>{label || 'TERMINAL'}</span><button aria-label="Copy command" onClick={async()=>{try{await navigator.clipboard.writeText(children);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);}}}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy'}</button></div><pre><code>{children}</code></pre></div>;
}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector<HTMLElement>('button')?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[]);
  return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={panel} className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const elements=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select');if(elements?.length){const first=elements[0],last=elements[elements.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</section></div>;
}
