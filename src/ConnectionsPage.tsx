import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,RefreshCw} from 'lucide-react';
import type {Config} from './lib/hub';
import {countLabel,mergePage,readConnections,type Page} from './lib/social';
import {Avatar,PersonRow,useProfile} from './social-ui';

type Kind='followers'|'following';
export function ConnectionsPage({config,fid,kind,onProfile,onTab}:{config:Config;fid:number;kind:Kind;onProfile:(fid:number)=>void;onTab:(kind:Kind)=>void}) {
  const person=useProfile(config,fid),generation=useRef(0);
  const [page,setPage]=useState<Page<number>>(),[limit,setLimit]=useState(50),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const id=++generation.current;setPage(undefined);setLimit(50);setLoading(true);setError('');
    readConnections(config,fid,kind).then(value=>{if(id===generation.current)setPage(value);}).catch(error=>{if(id===generation.current)setError((error as Error).message);}).finally(()=>{if(id===generation.current)setLoading(false);});
    return()=>{generation.current++;};
  },[config,fid,kind,retry]);
  async function more(){
    if(!page||loading)return;
    if(limit<page.items.length){setLimit(value=>value+50);return;}
    if(!page.next)return;
    const id=generation.current;setLoading(true);setError('');
    try{const next=await readConnections(config,fid,kind,page.next);if(id===generation.current){setPage(value=>value?mergePage(value,next,n=>n):next);setLimit(value=>value+50);}}
    catch(error){if(id===generation.current)setError((error as Error).message);}finally{if(id===generation.current)setLoading(false);}
  }
  const title=kind==='followers'?'Followers':'Following';
  return <section className="connections-page">
    <div className="detail-heading"><button className="icon-button" aria-label="Back to profile" onClick={()=>onProfile(fid)}><ArrowLeft size={18}/></button><h1>{title}</h1><button className="icon-button" aria-label="Refresh accounts" disabled={loading} onClick={()=>setRetry(value=>value+1)}><RefreshCw size={17}/></button></div>
    <a className="connections-owner" href={`/profile/${fid}`} onClick={event=>{event.preventDefault();onProfile(fid);}}><Avatar person={person}/><span><strong>{person?.name||`FID ${fid}`}</strong><small>{person?.username?`@${person.username}`:`FID ${fid}`}</small></span></a>
    <div className="detail-tabs" role="tablist" aria-label="Profile connections">{(['followers','following'] as const).map(tab=><button key={tab} role="tab" id={`connections-${tab}`} aria-selected={kind===tab} aria-controls="connections-list" onClick={()=>onTab(tab)}>{tab==='followers'?'Followers':'Following'}</button>)}</div>
    <div id="connections-list" role="tabpanel" aria-labelledby={`connections-${kind}`} aria-busy={loading}>
      {error&&<div className="feed-message error" role="alert"><span>Could not load accounts. {error}</span><button className="text-button" onClick={()=>page?void more():setRetry(value=>value+1)}>Retry</button></div>}
      {!page&&loading?<div className="loading"><span className="loader"/><p>Reading accounts…</p></div>:page?.items.length?<><div className="feed-count"><span>{countLabel(page)} {title.toUpperCase()}</span></div>{page.items.slice(0,limit).map(account=><PersonRow key={account} config={config} fid={account} onProfile={onProfile}/>)}</>:page&&<div className="empty"><h3>No {kind} yet</h3><p>{kind==='followers'?'Accounts following this profile will appear here.':'Accounts this profile follows will appear here.'}</p></div>}
      {page&&(page.items.length>limit||page.next)&&<button className="load-more" disabled={loading} onClick={()=>void more()}>{loading?'Reading…':'Load more accounts'}</button>}
      {page?.next&&<p className="feed-limit">More accounts are available.</p>}
    </div>
  </section>;
}
