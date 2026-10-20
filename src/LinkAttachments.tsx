import { useEffect, useId, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { CastEmbeds } from './CastEmbeds';
// @ts-expect-error Shared URL validation for browser and server signing.
import { linkURL, resolveLinks } from '../link-embeds.mjs';

export function useComposerLinks(text:string,existing:string[],available:number) {
  const [manual,setManual]=useState<string[]>([]),[suppressed,setSuppressed]=useState<string[]>([]);
  const result=resolveLinks(text,manual,existing,suppressed,available) as {urls:string[];overflow:number};
  return {...result,
    add(value:string){const url=linkURL(value) as string;if(result.urls.includes(url)||existing.some(value=>{try{return linkURL(value)===url;}catch{return false;}}))return;if(result.urls.length>=available)throw new Error('All embed slots are full. Remove an embed to attach this link.');setSuppressed(values=>values.filter(value=>value!==url));setManual(values=>[...new Set([...values,url])]);},
    remove(value:string){let url=value;try{url=linkURL(value);}catch{/* Existing embeds may use another URL scheme. */}setManual(values=>values.filter(value=>value!==url));setSuppressed(values=>[...new Set([...values,url])]);},
    reset(){setManual([]);setSuppressed([]);},
  };
}
export function LinkAttachments({links,disabled=false,available,compact=false}:{links:ReturnType<typeof useComposerLinks>;disabled?:boolean;available:number;compact?:boolean}) {
  const [adding,setAdding]=useState(false),[value,setValue]=useState(''),[error,setError]=useState(''),[previews,setPreviews]=useState<string[]>([]);const id=useId(),previewKey=JSON.stringify(links.urls);
  useEffect(()=>{const timer=setTimeout(()=>setPreviews(JSON.parse(previewKey)),500);return()=>clearTimeout(timer);},[previewKey]);
  function attach(){try{links.add(value.trim());setValue('');setError('');setAdding(false);}catch(e){setError((e as Error).message);}}
  return <div className="link-attachments">
    {links.urls.map(url=><div className="composer-link-preview" key={url}><div className="composer-link-heading"><span>Link embed</span><button type="button" className="icon-button" aria-label={`Remove link embed ${url}`} disabled={disabled} onClick={()=>links.remove(url)}><X size={15}/></button></div><CastEmbeds urls={[url]} visible={previews.includes(url)}/></div>)}
    <button type="button" className={compact?'composer-tool attach-link-toggle':'text-button attach-link-toggle'} aria-label="Attach link" title="Attach link" disabled={disabled||links.urls.length>=available} aria-expanded={adding} onClick={()=>setAdding(value=>!value)}><Link2 size={19}/>{!compact&&'Attach link'}</button>
    {adding&&<div className="attach-link-input"><label htmlFor={id}>Link to embed</label><div><input id={id} type="url" placeholder="https://example.com" value={value} disabled={disabled} onChange={event=>{setValue(event.target.value);setError('');}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(!disabled)attach();}}}/><button type="button" className="button small-button" disabled={disabled||!value.trim()||links.urls.length>=available} onClick={attach}>Attach</button></div>{error&&<p className="small danger" role="alert">{error}</p>}</div>}
    {links.overflow>0&&<p className="small muted" role="status">Embed slots are full. Additional links stay as text.</p>}
  </div>;
}
