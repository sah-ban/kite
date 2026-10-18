import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { imageEmbeds } from './lib/images';
type Gif={id:string;url:string;preview:string;title:string};
export function GifPicker({onSelect,onClose,disabled=false}:{onSelect:(url:string)=>void;onClose:()=>void;disabled?:boolean}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(''),[items,setItems]=useState<Gif[]>([]),[next,setNext]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setError('');if(!page){setItems([]);setNext('');}
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/gifs?${new URLSearchParams({q:query.trim(),...(page?{pos:page}:{})})}`,{signal:abort.signal});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load GIFs.');
        if(!Array.isArray(result.items))throw new Error('Could not load GIFs.');
        const gifs:Gif[]=result.items.filter((item:Gif)=>{try{return typeof item.id==='string'&&typeof item.title==='string'&&Boolean(imageEmbeds([item.url]))&&Boolean(imageEmbeds([item.preview]));}catch{return false;}});
        if(abort.signal.aborted)return;
        setItems(previous=>{const all=page?[...previous,...gifs]:gifs;return all.filter((gif,index)=>all.findIndex(other=>other.id===gif.id)===index);});setNext(typeof result.next==='string'?result.next:'');
      }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
      finally{if(!abort.signal.aborted)setBusy(false);}
    },query&&!page?300:0);
    return()=>{clearTimeout(timer);abort.abort();};
  },[query,page,retry]);
  return <section className="gif-picker" aria-label="GIF picker">
    <div className="gif-picker-heading"><strong>{query.trim()?'Find a GIF':'Featured GIFs'}</strong><button type="button" className="icon-button" aria-label="Close GIF picker" onClick={onClose}><X size={16}/></button></div>
    <label className="gif-search"><Search size={16}/><input autoFocus aria-label="Search GIFs" placeholder="Search GIFs…" maxLength={100} value={query} onChange={event=>{setQuery(event.target.value);setPage('');}}/></label>
    <div className="gif-results" aria-busy={busy}>{items.map(gif=><button key={gif.id} type="button" className="gif-result" disabled={disabled} aria-label={`Attach ${gif.title}`} onClick={()=>onSelect(gif.url)}><img src={gif.preview} alt={gif.title} loading="lazy" referrerPolicy="no-referrer"/></button>)}</div>
    {busy&&<p className="small muted" role="status">Loading GIFs…</p>}
    {error?<div className="gif-picker-footer"><span className="small danger" role="alert">{error}</span><button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:!busy&&!items.length?<p className="small muted">No GIFs found. Try another search.</p>:null}
    <div className="gif-picker-footer"><a href="https://tenor.com/" target="_blank" rel="noreferrer" className="small muted">Powered by Tenor</a>{next&&!error&&<button type="button" className="text-button" disabled={busy} onClick={()=>setPage(next)}>Load more</button>}</div>
  </section>;
}
