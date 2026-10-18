import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { castDate, fullHash, hub, onlyCastAdds, type Cast, type Config } from './lib/hub';
import { Avatar, useProfile } from './social-ui';

const cache=new Map<string,{expires:number;value:Promise<Cast>}>();
function readQuote(config:Config,fid:number,hash:string):Promise<Cast> {
  const key=`${config.readUrl}:${fid}:${hash.toLowerCase()}`;
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now())return saved.value;
  const value=(async()=>{
    if(!Number.isSafeInteger(fid)||fid<=0||!fullHash(hash))throw new Error('Invalid quoted cast.');
    const cast=await hub<Cast>(config,'castById',{fid,hash});
    if(!onlyCastAdds([cast]).length||cast.data.fid!==fid||cast.hash.toLowerCase()!==hash.toLowerCase())throw new Error('Quoted cast unavailable.');
    return cast;
  })().catch(error=>{cache.delete(key);throw error;});
  cache.set(key,{expires:Date.now()+30_000,value});
  if(cache.size>200)cache.delete(cache.keys().next().value!);
  return value;
}

export function QuotedCast({config,fid,hash,visible,onOpen}:{config:Config;fid:number;hash:string;visible:boolean;onOpen:(cast:Cast)=>void}) {
  const [cast,setCast]=useState<Cast>(),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  const person=useProfile(config,cast?fid:0);
  useEffect(()=>{
    let active=true;
    setCast(undefined);setError(false);
    if(visible)readQuote(config,fid,hash).then(c=>{if(active)setCast(c);}).catch(()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[config,fid,hash,visible,attempt]);
  const characters=Array.from(cast?.data.castAddBody.text||''),truncated=characters.length>450;
  // A compact preview stops here; nested quotes open in their own conversation.
  return <div className="quote-preview" aria-busy={!cast&&!error}>
    <a className="quoted-cast" href={`/cast/${fid}/${hash}`} aria-label={cast?`Open quoted cast by ${person?.name||`FID ${fid}`}`:error?'Open unavailable quoted cast':'Open quoted cast'} onClick={event=>{event.preventDefault();onOpen(cast||{hash,data:{fid}} as Cast);}}>
      {cast?<>
        <div className="quote-author"><Avatar person={person}/><strong>{person?.name||`FID ${fid}`}</strong><span>{person?.username?`@${person.username}`:`FID ${fid}`}</span><time dateTime={castDate(cast.data.timestamp).toISOString()}>{castDate(cast.data.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>
        {cast.data.castAddBody.parentCastId&&<span className="quote-context">Reply to FID {cast.data.castAddBody.parentCastId.fid}</span>}
        {characters.length>0&&<p className="quote-text">{truncated?characters.slice(0,450).join('').trimEnd()+'…':cast.data.castAddBody.text}</p>}
        {cast.data.castAddBody.embeds?.filter(e=>e.url&&/^https?:\/\//.test(e.url)).slice(0,2).map((e,i)=><span className="quote-embed" key={i}>{e.url}</span>)}
        <span className="quote-footer">{truncated?'Read full cast':cast.data.castAddBody.embeds?.some(e=>e.castId)?'Open conversation · includes another quote':'Open conversation'} <ArrowUpRight size={12}/></span>
      </>:error?<><strong>Quoted cast unavailable</strong><p className="quote-text">It may have been deleted or be unavailable on this node.</p><span className="quote-footer">Open conversation <ArrowUpRight size={12}/></span></>:<><span className="quote-loading" role="status">Reading quoted cast…</span><span className="quote-skeleton"/><span className="quote-skeleton short"/></>}
    </a>
    {error&&<button className="text-button quote-retry" onClick={()=>setAttempt(v=>v+1)}>Retry quoted cast</button>}
  </div>;
}
