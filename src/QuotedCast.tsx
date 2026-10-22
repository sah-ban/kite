import { ProBadge } from './ProBadge';
import {CastTime} from './CastTime';
import { useEffect, useState } from 'react';
import { fullHash, hub, onlyCastAdds, type Cast, type Config } from './lib/hub';
import { Avatar, useProfile } from './social-ui';
import { CastEmbeds } from './CastEmbeds';
import { CastText } from './CastText';

const cache=new Map<string,{expires:number;value:Promise<Cast>}>();
let activeReads=0;
const waiting:(()=>void)[]=[];
function readQuote(config:Config,fid:number,hash:string):Promise<Cast> {
  const key=`${config.readUrl}:${fid}:${hash.toLowerCase()}`;
  const saved=cache.get(key);
  if(saved&&saved.expires>Date.now())return saved.value;
  const value=(async()=>{
    if(!Number.isSafeInteger(fid)||fid<=0||!fullHash(hash))throw new Error('Invalid quoted cast.');
    if(activeReads>=3)await new Promise<void>(resolve=>waiting.push(resolve));else activeReads++;
    try{
      const cast=await hub<Cast>(config,'castById',{fid,hash});
      if(!onlyCastAdds([cast]).length||cast.data.fid!==fid||cast.hash.toLowerCase()!==hash.toLowerCase())throw new Error('Quoted cast unavailable.');
      return cast;
    }finally{const next=waiting.shift();if(next)next();else activeReads--;}
  })().catch(error=>{cache.delete(key);throw error;});
  cache.set(key,{expires:Date.now()+30_000,value});
  if(cache.size>200)cache.delete(cache.keys().next().value!);
  return value;
}

export function QuotedCast({config,fid,hash,visible,onOpen,onProfile,initialCast,variant='quote'}:{config:Config;fid:number;hash:string;visible:boolean;onOpen:(cast:Cast)=>void;onProfile:(fid:number)=>void;initialCast?:Cast;variant?:'quote'|'notification'}) {
  const seed=initialCast&&onlyCastAdds([initialCast]).length&&initialCast.data.fid===fid&&initialCast.hash.toLowerCase()===hash.toLowerCase()?initialCast:undefined;
  const [cast,setCast]=useState<Cast|undefined>(seed),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  const description=variant==='notification'?'cast':'quoted cast';
  const person=useProfile(config,cast?fid:0);
  useEffect(()=>{
    let active=true;
    setCast(seed);setError(false);
    if(visible&&!seed)readQuote(config,fid,hash).then(c=>{if(active)setCast(c);}).catch(()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[config,fid,hash,visible,attempt,seed]);
  const open=()=>onOpen(cast||{hash,signer:'',data:{fid,timestamp:0,castAddBody:{text:'',mentions:[],mentionsPositions:[],embeds:[]}}});
  // A compact preview stops here; nested quotes open in their own conversation.
  return <div className={`quote-preview${variant==='notification'?' notification-cast-preview':''}`} aria-busy={!cast&&!error}>
    <div className="quoted-cast" role="link" tabIndex={0} aria-label={`Open ${error?'unavailable ':''}${description} by ${person?.name||`FID ${fid}`}`} onClick={event=>{
      if(event.defaultPrevented||event.button!==0||(event.target as HTMLElement).closest('a,button,input,textarea,select,video,audio,iframe,[role="button"],[contenteditable]')||window.getSelection()?.toString())return;
      event.preventDefault();event.stopPropagation();open();
    }} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget){event.preventDefault();event.stopPropagation();open();}}}>
    <div className="quoted-content">
      {cast?<>
        <div className="quote-author"><Avatar person={person}/><strong>{person?.name||`FID ${fid}`}</strong><ProBadge config={config} fid={fid} visible={visible}/><span>{person?.username?`@${person.username}`:`FID ${fid}`}</span><CastTime timestamp={cast.data.timestamp}/></div>
        {variant==='quote'&&cast.data.castAddBody.parentCastId&&<span className="quote-context">Reply to FID {cast.data.castAddBody.parentCastId.fid}</span>}
        <CastText config={config} cast={cast} visible={visible} onProfile={onProfile} limit={450} className="quote-text"/>
        {variant==='notification'&&cast.data.castAddBody.embeds?.some(embed=>embed.castId)&&<span className="quote-context">Quotes a cast</span>}
      </>:error?<><strong>{variant==='notification'?'Cast unavailable':'Quoted cast unavailable'}</strong><p className="quote-text">It may have been deleted or be unavailable on this node.</p></>:<><span className="quote-loading" role="status">Reading {description}…</span><span className="quote-skeleton"/><span className="quote-skeleton short"/></>}
    </div>
    {cast&&<CastEmbeds urls={cast.data.castAddBody.embeds?.flatMap(e=>e.url?[e.url]:[])||[]} visible={visible} compact/>}
    </div>
    {error&&<button className="text-button quote-retry" onClick={()=>setAttempt(v=>v+1)}>Retry {description}</button>}
  </div>;
}
