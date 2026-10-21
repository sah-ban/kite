import { ProBadge } from './ProBadge';
import {useEffect,useRef,useState} from 'react';
import {AtSign,Bell,Heart,MessageCircle,RefreshCw,Repeat2,UserPlus} from 'lucide-react';
import {type Cast,type Config} from './lib/hub';
import {hasMoreNotifications,mergeNotifications,readNotifications,type NotificationItem,type NotificationKind,type NotificationPage} from './lib/notifications';
import {Avatar,useProfile} from './social-ui';
import {CastText} from './CastText';
import {CastTime} from './CastTime';
import {FeedSkeleton} from './FeedSkeleton';
import {indexedNotifications,markNotificationsSeen,type IndexedNotificationPage} from './lib/indexed-notifications';

const kinds=[['all','All'],['mention','Mentions'],['reply','Replies'],['like','Likes'],['recast','Recasts'],['follow','Follows']] as const;
const labels:Record<NotificationKind,string>={mention:'mentioned you',reply:'replied to your cast',like:'liked your cast',recast:'recast your cast',follow:'followed you'};
const icons={mention:AtSign,reply:MessageCircle,like:Heart,recast:Repeat2,follow:UserPlus};
function NotificationRow({config,item,onProfile,onCast}:{config:Config;item:NotificationItem;onProfile:(fid:number)=>void;onCast:(cast:Cast)=>void}){
 const person=useProfile(config,item.actor),Icon=icons[item.kind];
 const cast=item.cast||(item.target?{hash:item.target.hash,signer:'',data:{fid:item.target.fid,timestamp:0,castAddBody:{text:'',mentions:[],mentionsPositions:[],embeds:[]}}}:undefined);
 const open=()=>cast?onCast(cast):onProfile(item.actor);
 return <article className={`notification-row notification-${item.kind}`} role="link" tabIndex={0} aria-label={`${person?.name||`FID ${item.actor}`} ${labels[item.kind]}. Open ${cast?'cast':'profile'}.`} onClick={event=>{
  if(event.defaultPrevented||event.button!==0||(event.target as HTMLElement).closest('a,button,input,textarea,select,[role="button"],[contenteditable]')||window.getSelection()?.toString())return;
  open();
 }} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget){event.preventDefault();open();}}}>
  <div className="notification-symbol"><Icon size={18}/></div>
  <button className="avatar-link" aria-label={`Open ${person?.name||`FID ${item.actor}`} profile`} onClick={()=>onProfile(item.actor)}><Avatar person={person}/></button>
  <div className="notification-main"><div className="notification-title"><button className="author" onClick={()=>onProfile(item.actor)}>{person?.name||`FID ${item.actor}`} <ProBadge config={config} fid={item.actor}/></button> <span>{labels[item.kind]}</span></div>
   <CastTime timestamp={item.timestamp}/>
   {item.cast&&<CastText config={config} cast={item.cast} visible onProfile={onProfile} limit={240} className="notification-cast-text"/>}
  </div>
 </article>;
}

type NotificationsProps={config:Config;fid?:number;onConnect:()=>void;onProfile:(fid:number)=>void;onCast:(cast:Cast)=>void;ready?:boolean;setupError?:string;onRetrySetup?:()=>void};
export function NotificationsPage(props:NotificationsProps){
 return props.config.indexedFeedEnabled?<LiveNotificationsPage {...props}/>:<LegacyNotificationsPage {...props}/>;
}
function LegacyNotificationsPage({config,fid,onConnect,onProfile,onCast}:NotificationsProps){
 const [filter,setFilter]=useState<NotificationKind|'all'>('all'),[page,setPage]=useState<NotificationPage>(),[limit,setLimit]=useState(50),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),request=useRef<AbortController|null>(null),reading=useRef(false);
 useEffect(()=>{
  const id=++generation.current,controller=new AbortController();request.current=controller;setError('');setLimit(50);
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
    {busy&&!page?<FeedSkeleton label="Loading notifications…"/>:filtered.length?filtered.slice(0,limit).map(item=><NotificationRow key={item.id} config={config} item={item} onProfile={onProfile} onCast={onCast}/>):<div className="empty"><Bell size={30}/><h3>{error?'Activity is unavailable':filter==='all'?'No notifications in loaded activity':`No ${kinds.find(([kind])=>kind===filter)?.[1].toLowerCase()} in loaded activity`}</h3><p>{error?'Refresh or retry to check again.':'Refresh to check for new activity, or load more to check older activity.'}</p></div>}
   </div>
   {page&&(filtered.length>limit||hasMoreNotifications(page.cursor))&&<button className="load-more" disabled={busy} onClick={()=>void more()}>{busy?'Reading…':'Load more activity'}</button>}
   {page&&<p className="feed-limit notification-coverage">Replies, likes and recasts checked on {page.cursor.scanned} of your most recent casts. Mentions and follows load separately. This view shows activity still available on your node.</p>}
  </>}
 </section>;
}

function LiveNotificationsPage({config,fid,onConnect,onProfile,onCast,ready,setupError,onRetrySetup}:NotificationsProps){
 const [filter,setFilter]=useState<NotificationKind|'all'>('all'),[page,setPage]=useState<IndexedNotificationPage>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[updates,setUpdates]=useState(false);
 const current=useRef<IndexedNotificationPage|undefined>(undefined),pending=useRef(false),request=useRef<AbortController|null>(null);
 useEffect(()=>{
  setPage(undefined);current.current=undefined;setError('');setUpdates(false);
  if(!fid||!ready)return;
  const controller=new AbortController();request.current=controller;let reading=false;pending.current=false;
  async function load(){
   if(reading||pending.current||document.visibilityState==='hidden')return;reading=true;pending.current=true;
   if(!current.current)setBusy(true);
   try{
    const next=await indexedNotifications(fid!,{kind:filter,signal:controller.signal});if(controller.signal.aborted)return;
    const previous=current.current;
    // Keep older pages and scroll position until the reader chooses to refresh.
    if(previous&&previous.items.length>50){setUpdates(JSON.stringify(next.items)!==JSON.stringify(previous.items.slice(0,50)));setPage({...previous,workerOnline:next.workerOnline,startedAt:next.startedAt});}
    else{current.current=next;setPage(next);markNotificationsSeen(fid!,next.serverTime);}
    setError('');
   }catch(error){if(!controller.signal.aborted)setError((error as Error).message);}
   finally{reading=false;if(!controller.signal.aborted){pending.current=false;setBusy(false);}}
  }
  void load();const timer=setInterval(()=>void load(),10000);
  window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
  return()=>{controller.abort();request.current?.abort();clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
 },[fid,ready,filter,revision]);
 async function more(){
  if(!fid||!page?.nextPageToken||pending.current)return;
  const controller=new AbortController();request.current=controller;pending.current=true;setBusy(true);setError('');
  try{const next=await indexedNotifications(fid,{kind:filter,cursor:page.nextPageToken,signal:controller.signal});if(!controller.signal.aborted){const merged={...next,items:[...page.items,...next.items.filter(item=>!page.items.some(old=>old.id===item.id))]};current.current=merged;setPage(merged);}}
  catch(error){if(!controller.signal.aborted)setError((error as Error).message);}
  finally{if(!controller.signal.aborted){pending.current=false;setBusy(false);}}
 }
 return <section className="notifications-page">
  <div className="detail-heading"><Bell size={22}/><h1>Notifications</h1>{fid&&ready&&<button className="icon-button" aria-label="Refresh notifications" disabled={busy} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={17} className={busy?'spin':''}/></button>}</div>
  {!fid?<div className="empty"><Bell size={30}/><h3>Your activity, in one place.</h3><p>Connect your account to start receiving mentions, replies, likes, recasts and follows.</p><button className="button primary" onClick={onConnect}>Connect account</button></div>:!ready?<div className="empty" role="status"><p>{setupError||'Preparing your notifications…'}</p>{setupError&&<button className="text-button" onClick={onRetrySetup}>Retry setup</button>}</div>:<>
   <div className="notification-filters" role="group" aria-label="Filter notifications">{kinds.map(([kind,label])=><button key={kind} className={filter===kind?'selected':''} aria-pressed={filter===kind} onClick={()=>setFilter(kind)}>{label}</button>)}</div>
   {error&&<div className="feed-message error" role="alert"><span>{error}</span><button className="text-button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Retry</button></div>}
   {page&&(!page.workerOnline||!page.startedAt)&&<div className="indexed-feed-status" role="status">{!page.startedAt?'Waiting for notification indexing to start…':'Notification updates are reconnecting. Saved activity is shown below.'}</div>}
   {updates&&<button className="load-more" onClick={()=>setRevision(value=>value+1)}>Activity has changed · Refresh</button>}
   <div className="notification-list" aria-live="polite" aria-busy={busy}>
    {busy&&!page?<FeedSkeleton label="Loading notifications…"/>:page?.items.length?page.items.map(item=><NotificationRow key={item.id} config={config} item={item} onProfile={onProfile} onCast={onCast}/>):<div className="empty"><Bell size={30}/><h3>{error?'Notifications are unavailable':filter==='all'?'You’re all caught up':`No ${kinds.find(([kind])=>kind===filter)?.[1].toLowerCase()} yet`}</h3><p>{error?'Retry to check again.':'New activity will appear here automatically.'}</p></div>}
   </div>
   {page?.nextPageToken&&<button className="load-more" disabled={busy} onClick={()=>void more()}>{busy?'Loading…':'Load more activity'}</button>}
   {page&&<p className="feed-limit notification-coverage">New activity{page.startedAt?` since ${new Date(page.startedAt).toLocaleString()}`:' after setup'} · Kept for {page.historyDays} days. Earlier activity is not imported.</p>}
  </>}
 </section>;
}
