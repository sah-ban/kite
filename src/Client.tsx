import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { Home, PenLine, Bell, Radio, UserRound, ArrowUpRight, RefreshCw, Search, ArrowRight, AlertCircle } from 'lucide-react';
import { hub, profile, following, type Cast, type Profile, type Config, type NodeInfo } from './lib/hub';
import { attribute } from './lib/attribution';
import type { Session } from './lib/signing';
const Account=lazy(()=>import('./Account').then(m=>({default:m.Account})));
const postCast=async(...args:Parameters<typeof import('./lib/signing')['postCast']>)=>(await import('./lib/signing')).postCast(...args);
const deleteCast=async(...args:Parameters<typeof import('./lib/signing')['deleteCast']>)=>(await import('./lib/signing')).deleteCast(...args);
const react=async(...args:Parameters<typeof import('./lib/signing')['react']>)=>(await import('./lib/signing')).react(...args);
const follow=async(...args:Parameters<typeof import('./lib/signing')['follow']>)=>(await import('./lib/signing')).follow(...args);
import { Modal } from './components';
import { FeedSkeleton } from './FeedSkeleton';
import { Toast } from './Toast';
import { reactionKey, type ReactionOverride } from './lib/reaction-feedback';
import { CastComposer } from './CastComposer';
import { AppHeader } from './AppHeader';
import { AccountMenu } from './AccountMenu';
import { Avatar } from './social-ui';
import { SearchPage } from './SearchPage';
import { FeedControls } from './FeedControls';
import { FeedToolbar } from './FeedToolbar';
import type { Filters } from './lib/feed-filters';
import { indexedFollowing, enrollFollowing, feedEnrollment, type FeedStatus } from './lib/indexed-feed';
import { filterByClient } from './lib/feed-filters';
import { CastCard, type CastHandlers } from './CastCard';
import { CastDetail } from './CastDetail';
import { QuotedCast } from './QuotedCast';
import { ImageAttachments } from './ImageAttachments';
import { LinkAttachments, useComposerLinks } from './LinkAttachments';
import { MentionComposer } from './MentionComposer';
import { ComposerUsage } from './ComposerUsage';
import { useCastLimits, composerUsage } from './lib/cast-limits';
import type { DraftMention } from './lib/mentions';
import { ConnectionsPage } from './ConnectionsPage';
import { EditCast } from './EditCast';
import { EditProfile } from './EditProfile';
import { ProfileHeader } from './ProfileHeader';
import { ProfileAbout } from './ProfileAbout';
import { SettingsPage } from './SettingsPage';
import { NotificationsPage } from './NotificationsPage';
import {useNotificationUnread} from './lib/indexed-notifications';
import { readLikedCasts } from './lib/profile-likes';
import { clientRoute } from './lib/routes';
import { castPath, type ActivityTab } from './lib/social';

type FeedSnapshot={casts:Cast[];pageToken:string;hasMore:boolean;followPage:number;followFids:number[];status:FeedStatus|null;newPosts:boolean;autoPages:number;refresh:number};

export function Client({config,openGuide}:{config:Config;openGuide:()=>void}) {
  const [info,setInfo]=useState<NodeInfo|null>(null),[nodeError,setNodeError]=useState(''),[session,setSession]=useState<Session|null>(null),[accountOpen,setAccountOpen]=useState(false),[controls,setControls]=useState(false);
  const [fid,setFid]=useState(37),[casts,setCasts]=useState<Cast[]>([]),[profiles,setProfiles]=useState<Record<number,Profile>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState<ReactNode>(''),[pageToken,setPageToken]=useState(''),[hasMore,setHasMore]=useState(false),[refresh,setRefresh]=useState(0),[followPage,setFollowPage]=useState(0),[followFids,setFollowFids]=useState<number[]>([]),[text,setText]=useState(''),[reply,setReply]=useState<Cast|null>(null),[quote,setQuote]=useState<Cast|null>(null),[replyText,setReplyText]=useState(''),[publishing,setPublishing]=useState(false),[actionBusy,setActionBusy]=useState(''),[mode,setMode]=useState<'all'|'include'|'exclude'>('all'),[signerKeys,setSignerKeys]=useState(''),[clientFids,setClientFids]=useState(''),[selfRegistered,setSelfRegistered]=useState(false),[attribution,setAttribution]=useState<Map<string,number>>(new Map()),[attributing,setAttributing]=useState(false),[followed,setFollowed]=useState<Set<number>>(new Set());
  const [draftMentions,setDraftMentions]=useState<DraftMention[]>([]),[replyMentions,setReplyMentions]=useState<DraftMention[]>([]);
  const [images,setImages]=useState<string[]>([]),[replyImages,setReplyImages]=useState<string[]>([]),[uploading,setUploading]=useState(false),[replyUploading,setReplyUploading]=useState(false);
  const [editingCast,setEditingCast]=useState<Cast|null>(null),[editCastOpen,setEditCastOpen]=useState(false);
  const [editProfileOpen,setEditProfileOpen]=useState(false),[composeOpen,setComposeOpen]=useState(false);
  const composeTrigger=useRef<HTMLElement|null>(null);
  const [toastError,setToastError]=useState(''),[reactionOverrides,setReactionOverrides]=useState<Record<string,ReactionOverride>>({});
  const reactionRequests=useRef(new Set<string>());
  const [deletePending,setDeletePending]=useState<Cast|null>(null),[deleting,setDeleting]=useState(false);
  const [view,setView]=useState(()=>clientRoute(location.pathname,location.search));
  const limits=useCastLimits(config,session?.fid,refresh),maximum=limits.maxEmbeds;
  const links=useComposerLinks(text,images,maximum-images.length);
  const replyLinks=useComposerLinks(replyText,replyImages,maximum-(quote?1:0)-replyImages.length);
  const replyUsage=composerUsage(replyText,replyMentions,replyImages.length+replyLinks.urls.length+(quote?1:0),limits);
  const composing=reply||quote;
  const feed=view.kind==='profile'?'profile':'following';
  const selectedFeedFid=(view.kind==='home'||view.kind==='following')?view.feedFid:undefined;
  const feedFid=selectedFeedFid||session?.fid||config.defaultFeedFid||37;
  const [indexedFids,setIndexedFids]=useState(()=>new Set(config.indexedFeedFids||[]));
  const [enrollmentError,setEnrollmentError]=useState<{fid:number;message:string}|null>(null),[enrollmentAttempt,setEnrollmentAttempt]=useState(0);
  const enrolling=feed==='following'&&Boolean(config.indexedFeedEnabled&&session?.fid===feedFid&&!indexedFids.has(feedFid));
  const indexed=feed==='following'&&indexedFids.has(feedFid);
  const notificationsReady=Boolean(session&&indexedFids.has(session.fid));
  const notificationUnread=useNotificationUnread(session?.fid,Boolean(config.indexedFeedEnabled&&notificationsReady));
  useEffect(()=>{
    if(!session||!config.indexedFeedEnabled)return;const controller=new AbortController();setEnrollmentError(null);
    enrollFollowing(session,controller.signal).then(()=>{if(!controller.signal.aborted)setIndexedFids(previous=>new Set([...previous,session.fid]));})
      .catch(error=>{if(!controller.signal.aborted)setEnrollmentError({fid:session.fid,message:error.message});});
    return()=>controller.abort();
  },[session,config.indexedFeedEnabled,enrollmentAttempt]);
  useEffect(()=>{
    if(!config.indexedFeedEnabled||indexedFids.has(feedFid)||session?.fid===feedFid)return;
    const controller=new AbortController();feedEnrollment(feedFid,controller.signal).then(enrolled=>{if(enrolled&&!controller.signal.aborted)setIndexedFids(previous=>new Set([...previous,feedFid]));}).catch(()=>{});
    return()=>controller.abort();
  },[config.indexedFeedEnabled,feedFid,session?.fid,indexedFids]);
  const [feedStatus,setFeedStatus]=useState<FeedStatus|null>(null),[newPosts,setNewPosts]=useState(false);
  const feedCache=useRef(new Map<string,FeedSnapshot>()),loadedFeedKey=useRef(''),loadedFeedRevision=useRef(-1),scrollPositions=useRef(new Map<string,number>()),pendingScroll=useRef<number|null>(null),currentPath=useRef(location.pathname+location.search);
  function rememberScroll(){const path=currentPath.current;scrollPositions.current.set(path,window.scrollY);history.replaceState({...history.state,kiteScrollY:window.scrollY},'');}
  useEffect(()=>{const previous=history.scrollRestoration;history.scrollRestoration='manual';return()=>{history.scrollRestoration=previous;};},[]);
  useEffect(()=>{let frame=0;const save=()=>{if(pendingScroll.current!==null||frame)return;frame=requestAnimationFrame(()=>{frame=0;rememberScroll();});};window.addEventListener('scroll',save,{passive:true});return()=>{window.removeEventListener('scroll',save);cancelAnimationFrame(frame);};},[]);
  function navigate(path:string){
    rememberScroll();const next=new URL(path,location.origin),key=next.pathname+next.search;
    const target=key===currentPath.current?0:scrollPositions.current.get(key)||0;
    history.pushState({freecast:true,kiteScrollY:target},'',path);currentPath.current=key;pendingScroll.current=target;setView(clientRoute(location.pathname,location.search));
  }
  function openProfile(n:number){setFid(n);navigate(`/profile/${n}`);}
  function openCast(c:Cast,tab:ActivityTab='replies'){navigate(`${castPath(c)}${tab==='replies'?'':`?tab=${tab}`}`);}
  function published(fid:number,hash:string){const path=`/cast/${fid}/${hash}`;setNotice(<>Cast published <a className="published-cast-link" href={path} onClick={event=>{event.preventDefault();navigate(path);}}>View cast →</a></>);}
  useEffect(()=>{const pop=()=>{scrollPositions.current.set(currentPath.current,window.scrollY);const key=location.pathname+location.search;currentPath.current=key;pendingScroll.current=Number(history.state?.kiteScrollY??scrollPositions.current.get(key)??0);setView(clientRoute(location.pathname,location.search));};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{if(view.kind==='profile'){setFid(view.fid);}},[view]);
  const [order,setOrder]=useState<'newest'|'oldest'>('newest');
  const [profileCastType,setCastType]=useState<'posts'|'replies'|'likes'>('posts');
  const castType=feed==='profile'?profileCastType:'posts';
  const likesView=castType==='likes';
  const autoPages=useRef(0);
  const feedKey=JSON.stringify([feed,feed==='profile'?fid:feedFid,castType,feed==='profile'||indexed?order:'',indexed?[mode,clientFids,signerKeys,selfRegistered]:null,session?.fid||0,indexed]);
  const feedView=['home','following','profile'].includes(view.kind);
  useEffect(()=>{
    if(pendingScroll.current===null)return;
    const target=pendingScroll.current,path=currentPath.current;let frame=0;
    const release=()=>{if(currentPath.current===path)pendingScroll.current=null;observer.disconnect();};
    const restore=()=>{if(currentPath.current!==path||pendingScroll.current===null)return;if(feedView&&busy&&!casts.length)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(currentPath.current!==path||pendingScroll.current===null)return;window.scrollTo(0,target);if(document.documentElement.scrollHeight-innerHeight>=target)release();});};
    const observer=new ResizeObserver(restore),column=document.querySelector('.feed-column');if(column)observer.observe(column);restore();
    const interrupt=(event:Event)=>{if(event instanceof KeyboardEvent&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))return;release();};
    const timeout=setTimeout(release,3000);window.addEventListener('wheel',interrupt,{passive:true});window.addEventListener('touchstart',interrupt,{passive:true});window.addEventListener('keydown',interrupt);
    return()=>{clearTimeout(timeout);cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('wheel',interrupt);window.removeEventListener('touchstart',interrupt);window.removeEventListener('keydown',interrupt);};
  },[view,busy,casts.length]);
  useEffect(()=>{
    if(!feedView||busy||reading.current||error||loadedFeedKey.current!==feedKey)return;
    feedCache.current.delete(feedKey);feedCache.current.set(feedKey,{casts,pageToken,hasMore,followPage,followFids,status:feedStatus,newPosts,autoPages:autoPages.current,refresh:loadedFeedRevision.current});
    if(feedCache.current.size>10)feedCache.current.delete(feedCache.current.keys().next().value!);
  },[feedView,feedKey,casts,pageToken,hasMore,followPage,followFids,feedStatus,newPosts,refresh,busy,error]);
  const profileOrder=feed==='profile'?order:'newest';
  const requestId=useRef(0), reading=useRef(false), replyComposer=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{
    if(!config.approvalConfigured||(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&location.protocol!=='https:'))return;
    let active=true;
    fetch('/api/auth/session').then(r=>r.ok?r.json():null).then(result=>{if(active&&result?.state==='active'&&result.session)setSession({...result.session,remote:true});}).catch(()=>{});
    return()=>{active=false;};
  },[config]);
  async function lockSession(){
    setError('');
    if(session?.remote){try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(25_000)});if(!r.ok)throw new Error('Could not end the approval session. Try again.');}catch(e){setError((e as Error).message);return;}}
    setSession(null);
    if(view.kind==='home'||view.kind==='following'){navigate('/');}
  }

  useEffect(()=>{let active=true;hub<NodeInfo>(config,'info').then(v=>{if(active){setInfo(v);setNodeError('');}}).catch(e=>{if(active)setNodeError(e.message);});return()=>{active=false;};},[config,refresh]);
  useEffect(()=>{if(!session){setFollowed(new Set());return;}let active=true;following(config,session.fid).then(fids=>{if(active)setFollowed(new Set(fids));}).catch(e=>{if(active)setNotice(`Follow list unavailable: ${e.message}`);});return()=>{active=false;};},[session,config,refresh]);
  useEffect(()=>{if(!feedView)return;if(enrolling){setCasts([]);setFeedStatus(null);setHasMore(false);setBusy(false);return;}const id=++requestId.current;setError('');const cached=feedCache.current.get(feedKey);
    if(cached&&cached.refresh===refresh){reading.current=false;loadedFeedKey.current=feedKey;loadedFeedRevision.current=cached.refresh;autoPages.current=cached.autoPages;setCasts(cached.casts);setPageToken(cached.pageToken);setHasMore(cached.hasMore);setFollowPage(cached.followPage);setFollowFids(cached.followFids);setFeedStatus(cached.status);setNewPosts(cached.newPosts);setBusy(false);return()=>{requestId.current++;};}
    reading.current=true;autoPages.current=0;if(loadedFeedKey.current!==feedKey){setCasts([]);setPageToken('');setHasMore(false);setFollowPage(0);}setBusy(true);(async()=>{
    if(indexed){
      const page=await indexedFollowing(feedFid,{mode,clientFids,signerKeys,selfRegistered},order);if(id!==requestId.current)return;
      setCasts(page.messages);setPageToken(page.nextPageToken);setHasMore(Boolean(page.nextPageToken));setFeedStatus(page.status);setNewPosts(false);
    }else if(feed==='following'){
      setFeedStatus(null);
      const fids=[...new Set(await following(config,feedFid))].filter(n=>n!==feedFid);if(id!==requestId.current)return;setFollowFids(fids);
      const results=await Promise.allSettled(fids.slice(0,12).map(f=>hub<{messages:Cast[]}>(config,'castsByFid',{fid:f,pageSize:15,reverse:'true'})));
      const successes=results.filter((r):r is PromiseFulfilledResult<{messages:Cast[]}>=>(r.status==='fulfilled'));
      if(id!==requestId.current)return;
      setCasts(successes.flatMap(r=>r.value.messages).sort((a,b)=>b.data.timestamp-a.data.timestamp));setFollowPage(12);setHasMore(fids.length>12);
      if(successes.length<results.length)setError('Some profile requests failed. Refresh to retry missing authors.');
    } else {
      const page=likesView?await readLikedCasts(config,fid,profileOrder):await hub<{messages:Cast[];nextPageToken?:string}>(config,'castsByFid',{fid,pageSize:30,reverse:String(profileOrder==='newest')});if(id!==requestId.current)return;
      setCasts(page.messages);setPageToken(page.nextPageToken||'');setHasMore(!!page.nextPageToken);
    }
  })().then(()=>{if(id===requestId.current)loadedFeedRevision.current=refresh;}).catch(e=>{if(id===requestId.current)setError(e.message);}).finally(()=>{if(id===requestId.current){loadedFeedKey.current=feedKey;reading.current=false;setBusy(false);}});return()=>{requestId.current++;};},[feedKey,fid,feed,feedFid,config,refresh,profileOrder,view.kind,likesView,indexed,enrolling,indexed?order:null,indexed?mode:null,indexed?clientFids:null,indexed?signerKeys:null,indexed?selfRegistered:null]);
  useEffect(()=>{const fids=[...new Set([fid,feedFid,...(session?[session.fid]:[]),...casts.map(c=>c.data.fid)])];let active=true;(async()=>{for(let i=0;i<fids.length;i+=5)await Promise.all(fids.slice(i,i+5).map(async f=>{try{const p=await profile(config,f);if(active)setProfiles(v=>({...v,[f]:p}));}catch{/* FID remains usable without profile data */}}));})();return()=>{active=false;};},[casts,fid,feedFid,config,session?.fid]);
  useEffect(()=>{if(indexed||mode==='all'||(!clientFids.trim()&&!selfRegistered)){setAttributing(false);return;}let active=true;setAttributing(true);attribute(config,casts).then(map=>{if(active)setAttribution(map);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setAttributing(false);});return()=>{active=false;};},[casts,mode,clientFids,selfRegistered,config,indexed]);
  const typedCasts=likesView?casts:casts.filter(c=>Boolean(c.data.castAddBody.parentCastId)===(castType==='replies'));
  const filtered=indexed?casts:filterByClient(likesView?typedCasts:[...typedCasts].sort((a,b)=>(order==='newest'?-1:1)*(a.data.timestamp-b.data.timestamp)||a.hash.localeCompare(b.hash)),{mode,clientFids,signerKeys,selfRegistered},attribution);
  useEffect(()=>{
    if(!feedView||reading.current||busy||error||attributing||!hasMore||filtered.length||autoPages.current>=3)return;
    autoPages.current++;
    void loadMore(true);
  },[busy,error,attributing,hasMore,filtered.length,casts,castType,view.kind]);
  useEffect(()=>{
    if(!indexed||!['home','following'].includes(view.kind))return;const controller=new AbortController();let polling=false;
    const timer=setInterval(async()=>{if(polling||document.hidden)return;polling=true;try{
      const page=await indexedFollowing(feedFid,{mode,clientFids,signerKeys,selfRegistered},order,'',controller.signal);
      if(controller.signal.aborted)return;setFeedStatus(page.status);
      if(!casts.length){setCasts(page.messages);setPageToken(page.nextPageToken);setHasMore(Boolean(page.nextPageToken));}
      else if(page.messages[0]?.hash&&page.messages[0].hash!==casts[0]?.hash)setNewPosts(true);
    }catch{/* Keep saved posts and let explicit refresh report errors. */}finally{polling=false;}},15000);
    return()=>{clearInterval(timer);controller.abort();};
  },[indexed,feedFid,mode,clientFids,signerKeys,selfRegistered,order,casts.length,casts[0]?.hash,view.kind]);
  function selectCastType(next:'posts'|'replies'|'likes'){autoPages.current=0;setCastType(next);}
  async function loadMore(automatic=false){if(reading.current)return;reading.current=true;if(!automatic)autoPages.current=0;const id=requestId.current;setBusy(true);setError('');try{
    if(indexed){
      const page=await indexedFollowing(feedFid,{mode,clientFids,signerKeys,selfRegistered},order,pageToken);if(id!==requestId.current)return;
      setCasts(value=>[...value,...page.messages.filter(cast=>!value.some(old=>old.hash===cast.hash))]);setPageToken(page.nextPageToken);setHasMore(Boolean(page.nextPageToken));setFeedStatus(page.status);
    }else if(feed==='profile'){
      const page=likesView?await readLikedCasts(config,fid,profileOrder,pageToken):await hub<{messages:Cast[];nextPageToken?:string}>(config,'castsByFid',{fid,pageSize:30,reverse:String(profileOrder==='newest'),pageToken});if(id!==requestId.current)return;setCasts(v=>[...v,...page.messages.filter(c=>!v.some(old=>old.hash===c.hash))]);setPageToken(page.nextPageToken||'');setHasMore(!!page.nextPageToken);
    }else{
      const batch=followFids.slice(followPage,followPage+12);const pages=await Promise.all(batch.map(f=>hub<{messages:Cast[]}>(config,'castsByFid',{fid:f,pageSize:15,reverse:'true'})));if(id!==requestId.current)return;setCasts(v=>[...v,...pages.flatMap(p=>p.messages)].sort((a,b)=>b.data.timestamp-a.data.timestamp));setFollowPage(v=>v+12);setHasMore(followPage+12<followFids.length);
    }
  }catch(e){if(id===requestId.current)setError((e as Error).message);}finally{if(id===requestId.current){reading.current=false;setBusy(false);}}}
  async function performReaction(cast:Cast,kind:'like'|'recast',remove:boolean){
    if(!session){setAccountOpen(true);return;}
    const key=reactionKey(session.fid,cast,kind);if(reactionRequests.current.has(key))return;
    reactionRequests.current.add(key);setToastError('');const previous=reactionOverrides[key],optimistic={active:!remove,pending:true,startedAt:Date.now()};
    setReactionOverrides(values=>({...values,[key]:optimistic}));
    try{await react(config,session,cast,kind,remove);setReactionOverrides(values=>({...values,[key]:{...optimistic,pending:false}}));}
    catch(error){setReactionOverrides(values=>{const next={...values};if(previous)next[key]=previous;else delete next[key];return next;});setToastError((error as Error).message);}
    finally{reactionRequests.current.delete(key);}
  }

  const handlers:CastHandlers={
    onProfile:openProfile,onOpen:openCast,reactionOverrides,
    onReactionSynced:(key,override)=>setReactionOverrides(values=>{if(values[key]!==override)return values;const next={...values};delete next[key];return next;}),
    onEdit:cast=>{if(session?.fid===cast.data.fid){setError('');if(!editingCast)setEditingCast(cast);setEditCastOpen(true);}},
    onDelete:cast=>{if(session?.fid===cast.data.fid){setError('');setDeletePending(cast);}},
    onQuote:c=>{setQuote(c);setReply(null);setReplyText('');setReplyMentions([]);setReplyImages([]);replyLinks.reset();setError('');setTimeout(()=>replyComposer.current?.focus(),0);},
    onReply:c=>{setQuote(null);setReply(c);setReplyText('');setReplyMentions([]);setReplyImages([]);replyLinks.reset();setError('');setTimeout(()=>replyComposer.current?.focus(),0);},
    onReact:(c,kind,remove)=>{void performReaction(c,kind,remove);},
  };
  const renderCast=(c:Cast)=><CastCard key={c.hash} config={config} cast={c} handlers={handlers} revision={refresh} sessionFid={session?.fid} busy={Boolean(actionBusy)}/>;
  async function toggleFollow(){
    if(!session){setAccountOpen(true);return;}if(actionBusy==='follow')return;
    const target=fid,wasFollowed=followed.has(target);setActionBusy('follow');setToastError('');
    setFollowed(values=>{const next=new Set(values);wasFollowed?next.delete(target):next.add(target);return next;});
    try{await follow(config,session,target,wasFollowed);feedCache.current.clear();setNotice(wasFollowed?'Account unfollowed':'Account followed');}
    catch(error){setFollowed(values=>{const next=new Set(values);wasFollowed?next.add(target):next.delete(target);return next;});setToastError((error as Error).message);}
    finally{setActionBusy('');}
  }
  const currentFilters:Filters={mode,clientFids,signerKeys,selfRegistered};
  function applyFilters(filters:Filters){setMode(filters.mode);setClientFids(filters.clientFids);setSignerKeys(filters.signerKeys);setSelfRegistered(filters.selfRegistered);}
  const homeActive=view.kind==='home'||view.kind==='following';
  const navigation=[
    {label:'Home',Icon:Home,active:homeActive,action:()=>navigate('/')},
    {label:'Search',Icon:Search,active:view.kind==='search',action:()=>navigate('/search')},
    {label:'Notifications',Icon:Bell,active:view.kind==='notifications',action:()=>navigate('/notifications')},
    {label:'Profile',Icon:UserRound,active:(view.kind==='profile'||view.kind==='about')&&view.fid===session?.fid,action:()=>session?openProfile(session.fid):setAccountOpen(true)},
  ];
  function startCompose(){if(!session){setAccountOpen(true);return;}composeTrigger.current=document.activeElement as HTMLElement|null;setComposeOpen(true);}
  const mobileNavigation=[...navigation.slice(0,2),{label:'New cast',Icon:PenLine,active:composeOpen,action:startCompose},...navigation.slice(2)];
  async function publishDraft():Promise<boolean>{
    if(!session){setAccountOpen(true);return false;}
    setPublishing(true);setError('');
    try{const hash=await postCast(config,session,text,undefined,undefined,draftMentions,images,links.urls);links.reset();setImages([]);setText('');setDraftMentions([]);setComposeOpen(false);published(session.fid,hash);setRefresh(value=>value+1);return true;}
    catch(error){setError((error as Error).message);return false;}finally{setPublishing(false);}
  }
  const composerProps={config,session,person:session?profiles[session.fid]:undefined,candidates:Object.values(profiles),text,mentions:draftMentions,onText:(value:string,mentions:DraftMention[])=>{setText(value);setDraftMentions(mentions);},images,onImages:setImages,links,limits,publishing,uploading,onUploading:setUploading,onPublish:publishDraft,onConnect:()=>setAccountOpen(true)};

  return <><AppHeader onHome={()=>navigate('/')} mobileHidden={!homeActive}><AccountMenu menuIcon session={session} person={session?profiles[session.fid]:undefined} onSettings={()=>navigate('/settings')} onConnect={()=>setAccountOpen(true)} onLock={lockSession}/></AppHeader>
  <main className="client-layout"><aside className="client-sidebar"><nav aria-label="Main navigation">{navigation.map(({label,Icon,active,action})=><button key={label} className={`sidebar-item ${active?'active':''} ${label.toLowerCase()}-nav`} aria-current={active?'page':undefined} onClick={action}><Icon size={22}/><span>{label}</span>{label==='Notifications'&&notificationUnread>0&&<b className="notification-unread" aria-label={`${notificationUnread} unread notifications`}>{notificationUnread>99?'99+':notificationUnread}</b>}</button>)}</nav><button className="button primary sidebar-compose" disabled={publishing||uploading} onClick={startCompose}><PenLine size={19}/>New cast</button><p className="sidebar-caption">Your people. Your feed.<br/>Kite · @kiteapp</p><AccountMenu session={session} person={session?profiles[session.fid]:undefined} onSettings={()=>navigate('/settings')} onConnect={()=>setAccountOpen(true)} onLock={lockSession}/></aside>
  <section className="feed-column">{view.kind==='about'?<ProfileAbout key={view.fid} config={config} fid={view.fid} revision={refresh} onProfile={openProfile}/>:view.kind==='search'?<SearchPage config={config} onFound={openCast} onProfile={openProfile}/>:view.kind==='settings'?<SettingsPage config={config} session={session} info={info} nodeError={nodeError} filterMode={mode} feedStatus={feedStatus} onAccount={()=>setAccountOpen(true)} onLock={lockSession} onProfile={openProfile} onEditProfile={()=>setEditProfileOpen(true)} onFeedControls={()=>setControls(true)} onRefresh={()=>setRefresh(value=>value+1)} onGuide={openGuide}/>:view.kind==='notifications'?<NotificationsPage key={session?.fid||'signed-out'} config={config} fid={session?.fid} ready={notificationsReady} setupError={enrollmentError?.fid===session?.fid?enrollmentError?.message:undefined} onRetrySetup={()=>setEnrollmentAttempt(value=>value+1)} onConnect={()=>setAccountOpen(true)} onProfile={openProfile} onCast={openCast}/>:view.kind==='connections'?<ConnectionsPage key={`${view.fid}:${view.tab}`} config={config} fid={view.fid} kind={view.tab} onProfile={openProfile} onTab={kind=>navigate(`/profile/${view.fid}/${kind}`)}/>:view.kind==='cast'?<CastDetail config={config} fid={view.fid} hash={view.hash} tab={view.tab} onTab={tab=>{rememberScroll();const path=`/cast/${view.fid}/${view.hash}${tab==='replies'?'':`?tab=${tab}`}`;history.replaceState(history.state,'',path);currentPath.current=path;setView({...view,tab});}} handlers={handlers} revision={refresh} sessionFid={session?.fid} busy={Boolean(actionBusy)} onBack={()=>{if(history.state?.freecast)history.back();else navigate(`/profile/${view.fid}`);}}/>:<><div className={`feed-title${homeActive?' home-feed-title':''}`}><div><div className="eyebrow">YOUR NODE. YOUR FEED.</div><h1>{view.kind==='profile'?'Profile':'Home'}<span>✳</span></h1></div><button className="icon-button" aria-label="Refresh feed" onClick={()=>setRefresh(v=>v+1)} disabled={busy}><RefreshCw size={18} className={busy?'spin':''}/></button></div><FeedToolbar filters={currentFilters} onChange={applyFilters} onOpen={()=>setControls(true)} order={order} onOrder={setOrder} likes={likesView} indexed={indexed} following={feed==='following'} onRefresh={homeActive?()=>setRefresh(value=>value+1):undefined} refreshing={busy}/>
  {feed==='following'&&(!session||feedFid!==session.fid)&&<div className="public-feed-note"><span>Following feed for {profiles[feedFid]?.username?`@${profiles[feedFid].username}`:`FID ${feedFid}`}</span>{session?<button className="text-button" onClick={()=>navigate('/')}>Your feed</button>:<button className="text-button" onClick={()=>setAccountOpen(true)}>Connect account</button>}</div>}
  {feed==='following'&&enrolling&&<div className="indexed-feed-status" role="status">{enrollmentError?.fid===feedFid?<><span>{enrollmentError.message}</span><button className="text-button" onClick={()=>setEnrollmentAttempt(value=>value+1)}>Retry feed setup</button></>:<span>Preparing your Following feed…</span>}</div>}
  {indexed&&newPosts&&<button className="new-posts-button" onClick={()=>setRefresh(value=>value+1)}>New posts available · Refresh feed <RefreshCw size={14}/></button>}
  {indexed&&feedStatus&&(feedStatus.initializing||!feedStatus.workerOnline||feedStatus.connectedShards.length<feedStatus.checkpoints.length||feedStatus.followingFailed||feedStatus.failed>0)&&<div className="indexed-feed-status" role="status"><span>{feedStatus.queued?'Your following list is queued for import':feedStatus.initializing?`Importing recent posts · ${feedStatus.imported} of ${feedStatus.following} accounts ready`:`Following ${feedStatus.following} accounts · latest ${feedStatus.historyDays} days`}</span>{(!feedStatus.workerOnline||feedStatus.connectedShards.length<feedStatus.checkpoints.length)&&<span>Updates reconnecting · saved posts remain available</span>}{feedStatus.followingFailed&&<span>Following list unavailable · retrying automatically</span>}{feedStatus.failed>0&&<span>Retrying {feedStatus.failed} account(s)</span>}</div>}
  {view.kind==='profile'&&<ProfileHeader key={fid} onAbout={()=>navigate(`/profile/${fid}/about`)} config={config} fid={fid} viewerFid={session?.fid} onConnections={kind=>navigate(`/profile/${fid}/${kind}`)} onFollow={toggleFollow} followed={followed.has(fid)} busy={Boolean(actionBusy)} ownProfile={session?.fid===fid} revision={refresh} onEdit={()=>setEditProfileOpen(true)}/>}
  {(view.kind!=='profile'||session?.fid===fid)&&!composeOpen&&<CastComposer {...composerProps}/>}

  {error&&<div className="feed-message error" role="alert"><AlertCircle size={17}/><span>{error}</span><button className="text-button" disabled={busy} onClick={()=>setRefresh(value=>value+1)}>Retry</button><button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}
  {feed==='profile'&&<div className="cast-type-tabs" role="tablist" aria-label="Posts, replies and likes" onKeyDown={e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();
    const tabs=['posts','replies','likes'] as const;
    const next=e.key==='Home'?'posts':e.key==='End'?'likes':tabs[(tabs.indexOf(castType)+(e.key==='ArrowRight'?1:2))%3];
    selectCastType(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
  }}>
    <button role="tab" id="posts-tab" aria-controls="cast-feed" aria-selected={castType==='posts'} tabIndex={castType==='posts'?0:-1} onClick={()=>selectCastType('posts')}>Posts</button>
    <button role="tab" id="replies-tab" aria-controls="cast-feed" aria-selected={castType==='replies'} tabIndex={castType==='replies'?0:-1} onClick={()=>selectCastType('replies')}>Replies</button>
    <button role="tab" id="likes-tab" aria-controls="cast-feed" aria-selected={castType==='likes'} tabIndex={castType==='likes'?0:-1} onClick={()=>selectCastType('likes')}>Likes</button>
  </div>}
  <div className="feed-count"><span>{busy&&!filtered.length?'READING FROM YOUR NODE':`${filtered.length} ${castType.toUpperCase()}${mode!=='all'?' · FILTERED':''}`}</span>{attributing&&<span role="status">Resolving client keys…</span>}</div>
  <div id="cast-feed" role={feed==='profile'?'tabpanel':'region'} aria-labelledby={feed==='profile'?`${castType}-tab`:undefined} aria-label={feed==='following'?'Following posts':undefined} aria-busy={busy}>
  {enrolling?<div className="loading">{enrollmentError?.fid!==feedFid&&<span className="loader"/>}<p>{enrollmentError?.fid===feedFid?'Feed setup needs another try.':'Setting up your Following feed…'}</p></div>:indexed&&feedStatus?.initializing&&!filtered.length?<div className="loading"><span className="loader"/><p>{feedStatus.queued?'Loading your following list…':'Importing recent posts from accounts you follow…'}</p></div>:busy&&!filtered.length?<FeedSkeleton/>:filtered.length?filtered.map(renderCast):<div className="empty"><Radio size={30}/><h3>{error?'The feed is unavailable':`No ${castType} in this view`}</h3><p>{error?'Check your node connection and refresh.':hasMore?`No ${castType} match the loaded pages. Load more or adjust your client filter.`:feed==='following'?(session?'Follow some accounts to fill your home feed, or adjust your client filter.':'Try another public FID or connect your account to see casts from accounts you follow.'):`Try another FID or adjust your client filter.`}</p></div>}
  {hasMore&&<button className="load-more" disabled={busy} onClick={()=>loadMore()}>{busy?'Reading…':indexed?(order==='newest'?'Load older posts':'Load newer posts'):feed==='following'?'Load next 12 followed profiles':likesView?(order==='newest'?'Load older likes':'Load newer likes'):order==='newest'?'Load older casts':'Load newer casts'} <ArrowRight size={15}/></button>}{feed==='following'&&!indexed&&<p className="feed-limit">Showing up to 15 recent casts per followed account, loaded in batches of 12 accounts.</p>}
  </div>
  </>}

  {(view.kind==='cast'||view.kind==='settings')&&error&&<div className="feed-message error" role="alert">{error}</div>}
  {editingCast&&!editCastOpen&&session?.fid===editingCast.data.fid&&<div className="feed-message notice" role="status"><span>Your cast edit is still pending.</span><button type="button" className="text-button" onClick={()=>setEditCastOpen(true)}>Resume cast edit</button></div>}
  </section>
  {composeOpen&&<Modal title="New cast" className="compose-modal" onClose={()=>{if(!publishing&&!uploading){setComposeOpen(false);requestAnimationFrame(()=>{if(composeTrigger.current?.isConnected)composeTrigger.current.focus();});}}}><CastComposer {...composerProps} modal/>{error&&<p className="danger" role="alert">{error}</p>}</Modal>}
  {deletePending&&<Modal title="Delete this cast?" onClose={()=>{if(!deleting)setDeletePending(null);}}><p>This permanently removes your cast from Farcaster. This action cannot be undone.</p><div className="delete-confirm-actions"><button className="button" disabled={deleting} onClick={()=>setDeletePending(null)}>Cancel</button><button className="button delete-confirm" disabled={deleting} onClick={async()=>{
    if(!session||session.fid!==deletePending.data.fid){setError('Connect the account that owns this cast.');return;}
    const target=deletePending;setDeleting(true);setError('');
    try{await deleteCast(config,session,target);setDeletePending(null);setCasts(previous=>previous.filter(c=>c.hash!==target.hash));setNotice('Cast deleted');if(view.kind==='cast'&&view.hash===target.hash)openProfile(session.fid);setRefresh(value=>value+1);}
    catch(error){setError((error as Error).message);}finally{setDeleting(false);}
  }}>{deleting?'Deleting…':'Delete cast'}</button></div>{error&&<div className="feed-message error" role="alert">{error}</div>}</Modal>}
  {composing&&<Modal title={quote?'Quote cast':'Reply to cast'} onClose={()=>{if(!publishing){setReply(null);setQuote(null);setReplyImages([]);}}}>
    <div className="composer reply-modal-composer"><div><MentionComposer config={config} inputRef={replyComposer} value={replyText} mentions={replyMentions} candidates={Object.values(profiles)} onChange={(value,mentions)=>{setReplyText(value);setReplyMentions(mentions);}} placeholder={quote?'Add your thoughts…':'Write your reply…'} label={quote?'Quote text':'Reply text'} rows={4}/><ComposerUsage usage={replyUsage} limits={limits}/><ImageAttachments images={replyImages} reserved={replyLinks.urls.length+(quote?1:0)} onChange={setReplyImages} onBusy={setReplyUploading} max={maximum} disabled={publishing||!session}/><LinkAttachments links={replyLinks} available={maximum-(quote?1:0)-replyImages.length} disabled={publishing||replyUploading||!session}/>
    {quote?<QuotedCast config={config} fid={quote.data.fid} hash={quote.hash} visible onOpen={cast=>{setQuote(null);openCast(cast);}} onProfile={fid=>{setQuote(null);openProfile(fid);}}/>:<p className="small muted">Replying to FID {composing.data.fid} · <a className="text-button" href={castPath(composing)} onClick={event=>{event.preventDefault();openCast(composing);setReply(null);}}>View original cast</a></p>}
    <div className="composer-bottom"><span>{session?(profiles[session.fid]?.username?`@${profiles[session.fid].username}`:'Your account'):'Connect to publish'}</span><button className="button primary small-button" disabled={publishing||replyUploading||Boolean(session&&replyUsage.error)||Boolean(session&&!replyText.trim()&&!quote&&!replyImages.length&&!replyLinks.urls.length)} onClick={async()=>{
      if(!session){setReply(null);setQuote(null);setAccountOpen(true);return;}
      setPublishing(true);setError('');
      try{const hash=await postCast(config,session,replyText,reply||undefined,quote||undefined,replyMentions,replyImages,replyLinks.urls);replyLinks.reset();setReplyImages([]);setReplyText('');setReplyMentions([]);setReply(null);setQuote(null);published(session.fid,hash);setRefresh(value=>value+1);}
      catch(error){setError((error as Error).message);}finally{setPublishing(false);}
    }}>{publishing?'Publishing…':session?(quote?'Publish quote':'Publish reply'):'Connect to publish'}</button></div></div></div>{error&&<div className="feed-message error" role="alert">{error}</div>}
  </Modal>}

  {editingCast&&session?.fid===editingCast.data.fid&&<EditCast key={`${session.key}:${editingCast.hash}`} config={config} session={session} cast={editingCast} open={editCastOpen} onClose={pending=>{setEditCastOpen(false);if(!pending)setEditingCast(null);}} onDeleted={()=>setCasts(value=>value.filter(cast=>cast.hash!==editingCast.hash))} onPublished={hash=>{setEditingCast(null);setEditCastOpen(false);published(session.fid,hash);setRefresh(value=>value+1);if(view.kind==='cast'&&view.hash===editingCast.hash)openProfile(session.fid);}}/>}
  {editProfileOpen&&session&&<EditProfile key={session.key} config={config} session={session} onClose={()=>setEditProfileOpen(false)} onConnect={()=>{setEditProfileOpen(false);setAccountOpen(true);}} onSaved={()=>{setNotice('Profile updated');profile(config,session.fid).then(person=>setProfiles(value=>({...value,[person.fid]:person}))).catch(()=>{});setRefresh(value=>value+1);}}/>}
  {accountOpen&&<Suspense fallback={<div className="feed-message notice" role="status">Opening local account tools…</div>}><Account config={config} onSession={s=>{setSession(s);profile(config,s.fid).then(p=>setProfiles(v=>({...v,[s.fid]:p}))).catch(()=>{});}} onClose={()=>setAccountOpen(false)}/></Suspense>}
  {controls&&<FeedControls initial={{mode,clientFids,signerKeys,selfRegistered}} onClose={()=>setControls(false)} onApply={filters=>{applyFilters(filters);setControls(false);}}/>}
  </main><div className="toast-stack">{toastError&&<Toast error onDismiss={()=>setToastError('')}>{toastError}</Toast>}{notice&&<Toast onDismiss={()=>setNotice('')}>{notice}</Toast>}</div><nav className="mobile-nav" aria-label="Mobile navigation">{mobileNavigation.map(({label,Icon,active,action})=><button key={label} className={`${label==='New cast'?'mobile-compose ':''}${active?'active':''}`} aria-label={label} aria-current={active&&label!=='New cast'?'page':undefined} aria-haspopup={label==='New cast'?'dialog':undefined} disabled={label==='New cast'&&(publishing||uploading)} onClick={action}>{label==='Profile'&&session?<Avatar person={profiles[session.fid]}/>:<Icon size={22}/>}<span className="sr-only">{label}</span>{label==='Notifications'&&notificationUnread>0&&<b className="notification-unread" aria-label={`${notificationUnread} unread notifications`}>{notificationUnread>99?'99+':notificationUnread}</b>}</button>)}</nav></>;
}
