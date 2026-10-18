import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { type Config } from './lib/hub';
import { countLabel, mergePage, readConnections, type Page } from './lib/social';
import { Avatar, PersonRow, useProfile } from './social-ui';
import { Modal } from './components';

export function ProfileHeader({config,fid,onProfile,onFollow,followed,busy,ownProfile,revision}: {
  config:Config;fid:number;onProfile:(fid:number)=>void;onFollow:()=>void;followed:boolean;busy:boolean;ownProfile:boolean;revision:number;
}) {
  const person=useProfile(config,fid);
  const generation=useRef(0);
  const [pages,setPages]=useState<Partial<Record<'followers'|'following',Page<number>>>>({}),[list,setList]=useState<'followers'|'following'>(),[limit,setLimit]=useState(50),[loading,setLoading]=useState(false),[errors,setErrors]=useState<Partial<Record<'followers'|'following',string>>>({}),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;generation.current++;setPages({});setErrors({});setLoading(false);for(const kind of ['followers','following'] as const)readConnections(config,fid,kind).then(page=>{if(active)setPages(v=>({...v,[kind]:page}));}).catch(e=>{if(active)setErrors(v=>({...v,[kind]:(e as Error).message}));});return()=>{active=false;generation.current++;};},[config,fid,revision,retry]);
  async function more(){
    if(!list||loading)return;
    const page=pages[list];if(!page)return;
    if(limit<page.items.length){setLimit(v=>v+50);return;}
    if(!page.next)return;
    const id=generation.current;setLoading(true);
    try{const next=await readConnections(config,fid,list,page.next);if(id!==generation.current)return;setPages(v=>({...v,[list]:mergePage(v[list]!,next,n=>n)}));setLimit(v=>v+50);}
    catch(e){if(id===generation.current)setErrors(v=>({...v,[list]:(e as Error).message}));}finally{if(id===generation.current)setLoading(false);}
  }
  return <>
    <section className="profile-hero" aria-label="Profile">
      <div className="profile-cover"><span>YOUR CORNER OF THE NETWORK</span></div>
      <div className="profile-top"><Avatar person={person}/>{!ownProfile&&<button className="button small-button" disabled={busy} onClick={onFollow}>{followed?'Unfollow':'Follow'}</button>}</div>
      <h2>{person?.name||`FID ${fid}`}</h2><div className="profile-handle">{person?.username?`@${person.username}`:`FID ${fid}`} <span>· FID {fid}</span></div>
      {person?.bio&&<p className="profile-bio">{person.bio}</p>}
      <div className="profile-meta">{(['following','followers'] as const).map(kind=><button key={kind} onClick={()=>{setList(kind);setLimit(50);}}><strong>{countLabel(pages[kind])}</strong> {kind[0].toUpperCase()+kind.slice(1)}</button>)}<a href={`https://farcaster.xyz/${person?.username||fid}`} target="_blank" rel="noreferrer">Farcaster <ArrowUpRight size={12}/></a></div>
    </section>
    {list&&<Modal title={list==='followers'?'Followers':'Following'} onClose={()=>setList(undefined)}>
      {errors[list]?<div className="error" role="alert">Could not read this list. <button className="text-button" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:!pages[list]?<p>Reading accounts…</p>:!pages[list]!.items.length?<p>No accounts in this list yet.</p>:pages[list]!.items.slice(0,limit).map(n=><PersonRow key={n} config={config} fid={n} onProfile={n=>{setList(undefined);onProfile(n);}}/>)}
      {pages[list]&&(pages[list]!.items.length>limit||pages[list]!.next)&&<button className="load-more" disabled={loading} onClick={more}>{loading?'Reading…':'Load more accounts'}</button>}
      {pages[list]?.next&&<p className="small muted">{countLabel(pages[list])} accounts loaded. More results are available.</p>}
    </Modal>}
  </>;
}
