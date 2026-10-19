import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { GifPicker } from './GifPicker';
import { uploadImage } from './lib/images';
export function ImageAttachments({images,onChange,onBusy,disabled=false,max=2,reserved=0}:{images:string[];onChange:(images:string[])=>void;onBusy:(busy:boolean)=>void;disabled?:boolean;max?:number;reserved?:number}) {
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[gifOpen,setGifOpen]=useState(false);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;onBusy(false);},[onBusy]);
  return <div className="image-attachments">
    {images.length>0&&<div className="attachment-previews">{images.map((url,index)=><div className="attachment-preview" key={url+index}><img src={url} alt={`Attached image ${index+1}`} referrerPolicy="no-referrer"/><button type="button" className="icon-button" aria-label={`Remove image ${index+1}`} disabled={disabled||busy} onClick={()=>onChange(images.filter((_,i)=>i!==index))}><X size={16}/></button></div>)}</div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden disabled={disabled||busy||images.length+reserved>=max} onChange={async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file||controller.current||images.length+reserved>=max)return;
      const abort=new AbortController();controller.current=abort;setBusy(true);onBusy(true);setError('');
      const timeout=setTimeout(()=>abort.abort(),65_000);
      try{const url=await uploadImage(file,abort.signal);if(!abort.signal.aborted)onChange([...images,url]);}
      catch(e){if(controller.current===abort)setError(abort.signal.aborted?'Image upload timed out. Please try again.':(e as Error).message);}
      finally{clearTimeout(timeout);if(controller.current===abort){controller.current=null;setBusy(false);onBusy(false);}}
    }}/>
    <div className="attachment-toolbar"><button type="button" className="text-button" disabled={disabled||busy||images.length+reserved>=max} onClick={()=>input.current?.click()}><ImagePlus size={17}/>{busy?'Uploading image…':'Add image'}</button><button type="button" className="text-button gif-toggle" disabled={disabled||busy||images.length+reserved>=max} aria-expanded={gifOpen} onClick={()=>setGifOpen(value=>!value)}>GIF</button><span className="small muted">{images.length+reserved}/{max} · up to 10 MB each</span></div>
    {gifOpen&&<GifPicker disabled={disabled||busy||images.length+reserved>=max} onClose={()=>setGifOpen(false)} onSelect={url=>{if(disabled||busy||images.length+reserved>=max)return;onChange([...images,url]);setGifOpen(false);setError('');}}/>}
    {error&&<p className="small danger" role="alert">{error}</p>}
  </div>;
}
