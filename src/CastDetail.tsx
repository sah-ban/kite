import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { hub, type Cast, type Config } from './lib/hub';
import { countLabel, mergePage, readActivity, readReactions, readReplies, type Activity, type ActivityTab, type Page, type Reaction } from './lib/social';
import { CastCard, type CastHandlers } from './CastCard';
import { ReactionRow } from './ReactionRow';
import { FeedSkeleton } from './FeedSkeleton';

export function CastDetail({config,fid,hash,tab,onTab,handlers,revision,sessionFid,busy,onBack}: {
  config:Config;fid:number;hash:string;tab:ActivityTab;onTab:(tab:ActivityTab)=>void;handlers:CastHandlers;revision:number;sessionFid?:number;busy:boolean;onBack:()=>void;
}) {
  const [cast,setCast]=useState<Cast>(),[parent,setParent]=useState<Cast>(),[activity,setActivity]=useState<Activity>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[limit,setLimit]=useState(50),[retry,setRetry]=useState(0);
  const generation=useRef(0);
  useEffect(()=>{
    const id=++generation.current,controller=new AbortController();if(cast?.data.fid!==fid||cast?.hash!==hash){setCast(undefined);setParent(undefined);setActivity(undefined);}setError('');setLoading(false);setLimit(50);
    hub<Cast>(config,'castById',{fid,hash},controller.signal).then(async c=>{
      if(id!==generation.current)return;setCast(c);
      const parentId=c.data.castAddBody.parentCastId;
      if(parentId)hub<Cast>(config,'castById',parentId,controller.signal).then(p=>{if(id===generation.current)setParent(p);}).catch(()=>{});
      const value=await readActivity(config,c,retry?`${revision}:retry${retry}`:revision);
      if(id===generation.current)setActivity(value);
    }).catch(e=>{if(id===generation.current)setError((e as Error).message);});
    return()=>{generation.current++;controller.abort();};
  },[config,fid,hash,revision,retry]);
  useEffect(()=>setLimit(50),[tab]);
  async function more() {
    if(!cast||!activity||loading)return;
    const current=activity[tab];if(!current)return;
    if(limit<current.items.length){setLimit(v=>v+50);return;}
    if(!current.next)return;
    const id=generation.current,selected=tab;setLoading(true);setError('');
    try {
      if(selected==='replies'){
        const page=await readReplies(config,cast,current.next);
        if(id!==generation.current)return;
        setActivity(v=>v?{...v,replies:mergePage(v.replies!,page,c=>c.hash.toLowerCase())}:v);
      }else{
        const page=await readReactions(config,cast,selected,current.next);
        if(id!==generation.current)return;
        setActivity(v=>v?{...v,[selected]:mergePage(v[selected]!,page,m=>m.data.fid)}:v);
      }
      if(id===generation.current)setLimit(v=>v+50);
    }catch(e){if(id===generation.current)setError((e as Error).message);}
    finally{if(id===generation.current)setLoading(false);}
  }
  const page=activity?.[tab];
  return <section className="cast-detail">
    <div className="detail-heading"><button className="icon-button" aria-label="Back to feed" onClick={onBack}><ArrowLeft size={18}/></button><h1>Conversation</h1><button className="icon-button" aria-label="Refresh conversation" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={17}/></button></div>
    {error&&<div className="feed-message error" role="alert">{error}<button className="text-button" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>}
    {cast? <>
      {parent&&<div className="thread-parent"><span className="eyebrow">IN REPLY TO</span><CastCard config={config} cast={parent} handlers={handlers} revision={revision} sessionFid={sessionFid} busy={busy}/></div>}
      {cast.data.castAddBody.parentCastId&&!parent&&<button className="parent-link text-button" onClick={()=>handlers.onOpen({hash:cast.data.castAddBody.parentCastId!.hash,data:{fid:cast.data.castAddBody.parentCastId!.fid}} as Cast)}>View parent cast ↗</button>}
      <CastCard config={config} cast={cast} handlers={handlers} revision={revision} sessionFid={sessionFid} busy={busy} detailed activity={activity}/>
      <div className="detail-tabs" role="tablist" aria-label="Cast activity">
        {(['replies','likes','recasts'] as const).map(t=><button role="tab" key={t} id={`activity-${t}`} aria-selected={tab===t} aria-controls="activity-panel" onClick={()=>onTab(t)}>{t[0].toUpperCase()+t.slice(1)} <span>{activity?countLabel(activity[t]):'…'}</span></button>)}
      </div>
      <div id="activity-panel" role="tabpanel" aria-labelledby={`activity-${tab}`}>
        {!activity?<FeedSkeleton count={2} label="Loading cast activity…"/>:activity.errors[tab]?<div className="feed-message error" role="alert">Could not read {tab}. <button className="text-button" onClick={()=>setRetry(v=>v+1)}>Retry</button></div>:page?.items.length?
          tab==='replies'?(page.items as Cast[]).slice(0,limit).map(c=><CastCard key={c.hash} config={config} cast={c} handlers={handlers} revision={revision} sessionFid={sessionFid} busy={busy}/>):(page.items as Reaction[]).slice(0,limit).map(m=><ReactionRow key={m.hash} config={config} reaction={m} onProfile={handlers.onProfile}/>)
          :<div className="empty"><h3>No {tab} yet</h3><p>{tab==='replies'?'Start the conversation with a reply.':'Accounts will appear here when they react.'}</p></div>}
        {page&&(page.items.length>limit||page.next)&&<button className="load-more" disabled={loading} onClick={more}>{loading?'Reading…':`Load more ${tab}`}</button>}
        {page?.next&&<p className="feed-limit">{countLabel(page)} {tab} loaded. More results are available.</p>}
      </div>
    </>:!error&&<FeedSkeleton count={2} label="Opening cast…"/>}
  </section>;
}
