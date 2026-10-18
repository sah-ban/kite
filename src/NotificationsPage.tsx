import {useEffect,useRef,useState} from 'react';
import {AtSign,Bell,Heart,MessageCircle,RefreshCw,Repeat2,UserPlus} from 'lucide-react';
import {type Cast,type Config} from './lib/hub';
import {hasMoreNotifications,mergeNotifications,readNotifications,type NotificationItem,type NotificationKind,type NotificationPage} from './lib/notifications';
import {Avatar,useProfile} from './social-ui';
import {CastText} from './CastText';
import {CastTime} from './CastTime';

const kinds=[['all','All'],['mention','Mentions'],['reply','Replies'],['like','Likes'],['recast','Recasts'],['follow','Follows']] as const;
const labels:Record<NotificationKind,string>={mention:'mentioned you',reply:'replied to your cast',like:'liked your cast',recast:'recast your cast',follow:'followed you'};
const icons={mention:AtSign,reply:MessageCircle,like:Heart,recast:Repeat2,follow:UserPlus};
function NotificationRow({config,item,onProfile,onCast}:{config:Config;item:NotificationItem;onProfile:(fid:number)=>void;onCast:(cast:Cast)=>void}){
 const person=useProfile(config,item.actor),Icon=icons[item.kind];
 return <article className={`notification-row notification-${item.kind}`}>
  <div className="notification-symbol"><Icon size={18}/></div>
  <button className="avatar-link" aria-label={`Open ${person?.name||`FID ${item.actor}`} profile`} onClick={()=>onProfile(item.actor)}><Avatar person={person}/></button>
  <div className="notification-main"><div className="notification-title"><button className="author" onClick={()=>onProfile(item.actor)}>{person?.name||`FID ${item.actor}`}</button> <span>{labels[item.kind]}</span></div>
   <CastTime timestamp={item.timestamp}/>
   {item.cast&&<><CastText config={config} cast={item.cast} visible onProfile={onProfile} onOpen={onCast} limit={240} className="notification-cast-text"/><button className="text-button notification-open" onClick={()=>onCast(item.cast!)}>View cast →</button></>}
  </div>
 </article>;
}

export function NotificationsPage({config,fid,onConnect,onProfile,onCast}:{config:Config;fid?:number;onConnect:()=>void;onProfile:(fid:number)=>void;onCast:(cast:Cast)=>void}){
 const [filter,setFilter]=useState<NotificationKind|'all'>('all'),[page,setPage]=useState<NotificationPage>(),[limit,setLimit]=useState(50),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),request=useRef<AbortController|null>(null),reading=useRef(false);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();request.current=controller;setPage(undefined);setError('');setLimit(50);
  if(!fid)return;
  reading.current=true;setBusy(true);
  readNotifications(config,fid,undefined,controller.signal).then(value=>{if(id===generation.current)setPage(value);}).catch(error=>{if(!controller.signal.aborted&&id===generation.current)setError((error as Error).message);}).finally(()=>{if(id===generation.current){reading.current=false;setBusy(false);}});
  return()=>{generation.current++;request.current?.abort();};
 },[config,fid,refresh]);
 useEffect(()=>setLimit(50),[filter]);
 const filtered=page?.items.filter(item=>filter==='all'||item.kind===filter)||[];
 async function more(forceFetch=false){
  if(!fid||reading.current)return;
  if(!forceFetch&&limit<filtered.length){setLimit(value=>value+50);return;}
  if(!page||!hasMoreNotifications(page.cursor))return;
  const id=generation.current,controller=new AbortController();request.current=controller;reading.current=true;setBusy(true);setError('');
  try{const next=await readNotifications(config,fid,page.cursor,controller.signal);if(id===generation.current){setPage(value=>({...next,items:mergeNotifications(value?.items||[],next.items)}));setLimit(value=>value+50);}}
  catch(error){if(!controller.signal.aborted&&id===generation.current)setError((error as Error).message);}
  finally{if(id===generation.current){reading.current=false;setBusy(false);}}
 }
 return <section className="notifications-page">
  <div className="detail-heading"><Bell size={22}/><h1>Notifications</h1>{fid&&<button className="icon-button" aria-label="Refresh notifications" disabled={busy} onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={17} className={busy?'spin':''}/></button>}</div>
  {!fid?<div className="empty"><Bell size={30}/><h3>Your activity, in one place.</h3><p>Connect your account to see mentions, replies, likes, recasts and follows.</p><button className="button primary" onClick={onConnect}>Connect account</button></div>:<>
   <div className="notification-filters" role="group" aria-label="Filter notifications">{kinds.map(([kind,label])=><button key={kind} className={filter===kind?'selected':''} aria-pressed={filter===kind} onClick={()=>setFilter(kind)}>{label}</button>)}</div>
   {(error||!!page?.errors.length)&&<div className="feed-message error" role="alert"><span>{error||`Some activity could not load: ${page!.errors.join(', ')}.`}</span><button className="text-button" disabled={busy} onClick={()=>page?void more(true):setRefresh(value=>value+1)}>Retry</button></div>}
   <div className="notification-list" aria-live="polite" aria-busy={busy}>
    {busy&&!page?<div className="loading"><span className="loader"/><p>Reading your activity…</p></div>:filtered.length?filtered.slice(0,limit).map(item=><NotificationRow key={item.id} config={config} item={item} onProfile={onProfile} onCast={onCast}/>):<div className="empty"><Bell size={30}/><h3>{error?'Activity is unavailable':filter==='all'?'No notifications in loaded activity':`No ${kinds.find(([kind])=>kind===filter)?.[1].toLowerCase()} in loaded activity`}</h3><p>{error?'Refresh or retry to check again.':'Refresh to check for new activity, or load more to check older activity.'}</p></div>}
   </div>
   {page&&(filtered.length>limit||hasMoreNotifications(page.cursor))&&<button className="load-more" disabled={busy} onClick={()=>void more()}>{busy?'Reading…':'Load more activity'}</button>}
   {page&&<p className="feed-limit notification-coverage">Replies, likes and recasts checked on {page.cursor.scanned} of your most recent casts. Mentions and follows load separately. This view shows activity still available on your node.</p>}
  </>}
 </section>;
}
