import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { Settings, Bell, Radio, UserRound, Server, ArrowUpRight, RefreshCw, SlidersHorizontal, Search, ArrowRight, Users, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { hub, profile, following, filterBySigner, type Cast, type Profile, type Config, type NodeInfo } from './lib/hub';
import { attribute } from './lib/attribution';
import type { Session } from './lib/signing';
const Account=lazy(()=>import('./Account').then(m=>({default:m.Account})));
const postCast=async(...args:Parameters<typeof import('./lib/signing')['postCast']>)=>(await import('./lib/signing')).postCast(...args);
const deleteCast=async(...args:Parameters<typeof import('./lib/signing')['deleteCast']>)=>(await import('./lib/signing')).deleteCast(...args);
const react=async(...args:Parameters<typeof import('./lib/signing')['react']>)=>(await import('./lib/signing')).react(...args);
const follow=async(...args:Parameters<typeof import('./lib/signing')['follow']>)=>(await import('./lib/signing')).follow(...args);
import { Modal } from './components';
import { SearchPage } from './SearchPage';
import { FeedControls } from './FeedControls';
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
import { SettingsPage } from './SettingsPage';
import { NotificationsPage } from './NotificationsPage';
import { readLikedCasts } from './lib/profile-likes';
import { clientRoute } from './lib/routes';
import { castPath, type ActivityTab } from './lib/social';

function Avatar({p}:{p?:Profile}) {const [broken,setBroken]=useState(false);return <div className="avatar">{p?.avatar&&!broken?<img src={p.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>:<span>{(p?.name||'F').slice(0,1).toUpperCase()}</span>}</div>;}
export function Client({config,openGuide}:{config:Config;openGuide:()=>void}) {
  const [info,setInfo]=useState<NodeInfo|null>(null),[nodeError,setNodeError]=useState(''),[session,setSession]=useState<Session|null>(null),[accountOpen,setAccountOpen]=useState(false),[controls,setControls]=useState(false);
  const [fid,setFid]=useState(37),[homeFid,setHomeFid]=useState(37),[fidInput,setFidInput]=useState('37'),[casts,setCasts]=useState<Cast[]>([]),[profiles,setProfiles]=useState<Record<number,Profile>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState<ReactNode>(''),[pageToken,setPageToken]=useState(''),[hasMore,setHasMore]=useState(false),[refresh,setRefresh]=useState(0),[followPage,setFollowPage]=useState(0),[followFids,setFollowFids]=useState<number[]>([]),[text,setText]=useState(''),[reply,setReply]=useState<Cast|null>(null),[quote,setQuote]=useState<Cast|null>(null),[replyText,setReplyText]=useState(''),[publishing,setPublishing]=useState(false),[actionBusy,setActionBusy]=useState(''),[mode,setMode]=useState<'all'|'include'|'exclude'>('all'),[signerKeys,setSignerKeys]=useState(''),[clientFids,setClientFids]=useState(''),[attribution,setAttribution]=useState<Map<string,number>>(new Map()),[attributing,setAttributing]=useState(false),[followed,setFollowed]=useState<Set<number>>(new Set());
  const [draftMentions,setDraftMentions]=useState<DraftMention[]>([]),[replyMentions,setReplyMentions]=useState<DraftMention[]>([]);
  const [images,setImages]=useState<string[]>([]),[replyImages,setReplyImages]=useState<string[]>([]),[uploading,setUploading]=useState(false),[replyUploading,setReplyUploading]=useState(false);
  const [editingCast,setEditingCast]=useState<Cast|null>(null),[editCastOpen,setEditCastOpen]=useState(false);
  const [editProfileOpen,setEditProfileOpen]=useState(false);
  const [deletePending,setDeletePending]=useState<Cast|null>(null),[deleting,setDeleting]=useState(false);
  const [view,setView]=useState(()=>clientRoute(location.pathname,location.search));
  const limits=useCastLimits(config,session?.fid,refresh),maximum=limits.maxEmbeds;
  const links=useComposerLinks(text,images,maximum-images.length);
  const replyLinks=useComposerLinks(replyText,replyImages,maximum-(quote?1:0)-replyImages.length);
  const usage=composerUsage(text,draftMentions,images.length+links.urls.length,limits);
  const replyUsage=composerUsage(replyText,replyMentions,replyImages.length+replyLinks.urls.length+(quote?1:0),limits);
  const composing=reply||quote;
  const feed=view.kind==='profile'?'profile':'following';
  const feedFid=session?.fid||homeFid;
  function navigate(path:string){history.pushState({freecast:true},'',path);setView(clientRoute(location.pathname,location.search));window.scrollTo(0,0);}
  function openProfile(n:number){setFid(n);navigate(`/profile/${n}`);}
  function openCast(c:Cast,tab:ActivityTab='replies'){navigate(`${castPath(c)}${tab==='replies'?'':`?tab=${tab}`}`);}
  function published(fid:number,hash:string){const path=`/cast/${fid}/${hash}`;setNotice(<>Cast published <a className="published-cast-link" href={path} onClick={event=>{event.preventDefault();navigate(path);}}>View cast →</a></>);}
  function openFollowing(){navigate('/following');}
  useEffect(()=>{const pop=()=>setView(clientRoute(location.pathname,location.search));window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{if(view.kind==='profile'){setFid(view.fid);}},[view]);
  const [order,setOrder]=useState<'newest'|'oldest'>('newest');
  const [profileCastType,setCastType]=useState<'posts'|'replies'|'likes'>('posts');
  const castType=feed==='profile'?profileCastType:'posts';
  const likesView=castType==='likes';
  const autoPages=useRef(0);
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
  useEffect(()=>{if(view.kind==='cast'||view.kind==='connections'||view.kind==='notifications'||view.kind==='settings'||view.kind==='search')return;const id=++requestId.current;reading.current=true;autoPages.current=0;setCasts([]);setPageToken('');setHasMore(false);setFollowPage(0);setBusy(true);setError('');(async()=>{
    if(feed==='following'){
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
  })().catch(e=>{if(id===requestId.current)setError(e.message);}).finally(()=>{if(id===requestId.current){reading.current=false;setBusy(false);}});return()=>{requestId.current++;};},[fid,feed,feedFid,config,refresh,profileOrder,view.kind,likesView]);
  useEffect(()=>{const fids=[...new Set([fid,feedFid,...casts.map(c=>c.data.fid)])];let active=true;(async()=>{for(let i=0;i<fids.length;i+=5)await Promise.all(fids.slice(i,i+5).map(async f=>{try{const p=await profile(config,f);if(active)setProfiles(v=>({...v,[f]:p}));}catch{/* FID remains usable without profile data */}}));})();return()=>{active=false;};},[casts,fid,feedFid,config]);
  useEffect(()=>{if(mode==='all'||!clientFids.trim()){setAttributing(false);return;}let active=true;setAttributing(true);attribute(config,casts).then(map=>{if(active)setAttribution(map);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setAttributing(false);});return()=>{active=false;};},[casts,mode,clientFids,config]);
  const keys=signerKeys.split(/[\s,]+/).filter(Boolean), appFids=clientFids.split(/[\s,]+/).filter(Boolean).map(Number);
  const matchingKeys=[...new Set([...keys,...[...attribution].filter(([,requestFid])=>appFids.includes(requestFid)).map(([key])=>key)])];
  const typedCasts=likesView?casts:casts.filter(c=>Boolean(c.data.castAddBody.parentCastId)===(castType==='replies'));
  let filtered=filterBySigner(likesView?typedCasts:[...typedCasts].sort((a,b)=>(order==='newest'?-1:1)*(a.data.timestamp-b.data.timestamp)||a.hash.localeCompare(b.hash)),matchingKeys,mode);
  if(mode==='include'&&(keys.length||appFids.length)&&!matchingKeys.length)filtered=[];
  useEffect(()=>{
    if(view.kind==='cast'||view.kind==='connections'||view.kind==='notifications'||view.kind==='settings'||view.kind==='search'||reading.current||busy||error||attributing||!hasMore||filtered.length||autoPages.current>=3)return;
    autoPages.current++;
    void loadMore(true);
  },[busy,error,attributing,hasMore,filtered.length,casts,castType,view.kind]);
  function selectCastType(next:'posts'|'replies'|'likes'){autoPages.current=0;setCastType(next);}
  async function loadMore(automatic=false){if(reading.current)return;reading.current=true;if(!automatic)autoPages.current=0;const id=requestId.current;setBusy(true);setError('');try{
    if(feed==='profile'){
      const page=likesView?await readLikedCasts(config,fid,profileOrder,pageToken):await hub<{messages:Cast[];nextPageToken?:string}>(config,'castsByFid',{fid,pageSize:30,reverse:String(profileOrder==='newest'),pageToken});if(id!==requestId.current)return;setCasts(v=>[...v,...page.messages.filter(c=>!v.some(old=>old.hash===c.hash))]);setPageToken(page.nextPageToken||'');setHasMore(!!page.nextPageToken);
    }else{
      const batch=followFids.slice(followPage,followPage+12);const pages=await Promise.all(batch.map(f=>hub<{messages:Cast[]}>(config,'castsByFid',{fid:f,pageSize:15,reverse:'true'})));if(id!==requestId.current)return;setCasts(v=>[...v,...pages.flatMap(p=>p.messages)].sort((a,b)=>b.data.timestamp-a.data.timestamp));setFollowPage(v=>v+12);setHasMore(followPage+12<followFids.length);
    }
  }catch(e){if(id===requestId.current)setError((e as Error).message);}finally{if(id===requestId.current){reading.current=false;setBusy(false);}}}
  async function action(id:string,fn:(s:Session)=>Promise<unknown>){if(!session){setAccountOpen(true);return;}setActionBusy(id);setError('');try{await fn(session);setNotice('Accepted by validator. Refresh after your read node catches up.');}catch(e){setError((e as Error).message);}finally{setActionBusy('');}}
  const handlers:CastHandlers={
    onProfile:openProfile,onOpen:openCast,
    onEdit:cast=>{if(session?.fid===cast.data.fid){setError('');if(!editingCast)setEditingCast(cast);setEditCastOpen(true);}},
    onDelete:cast=>{if(session?.fid===cast.data.fid){setError('');setDeletePending(cast);}},
    onQuote:c=>{setQuote(c);setReply(null);setReplyText('');setReplyMentions([]);setReplyImages([]);replyLinks.reset();setError('');setTimeout(()=>replyComposer.current?.focus(),0);},
    onReply:c=>{setQuote(null);setReply(c);setReplyText('');setReplyMentions([]);setReplyImages([]);replyLinks.reset();setError('');setTimeout(()=>replyComposer.current?.focus(),0);},
    onReact:(c,kind,remove)=>{void action(`${kind}-${c.hash}`,async session=>{await react(config,session,c,kind,remove);setRefresh(v=>v+1);});},
  };
  const renderCast=(c:Cast)=><CastCard key={c.hash} config={config} cast={c} handlers={handlers} revision={refresh} sessionFid={session?.fid} busy={Boolean(actionBusy)}/>;
  const toggleFollow=()=>action('follow',async s=>{await follow(config,s,fid,followed.has(fid));setFollowed(prev=>{const next=new Set(prev);if(next.has(fid))next.delete(fid);else next.add(fid);return next;});setRefresh(v=>v+1);});
  return <main className="client-layout"><aside className="client-sidebar"><div className="sidebar-label">YOUR WORKSPACE</div><button className={view.kind==='home'?'sidebar-item active':'sidebar-item'} onClick={()=>{navigate('/');}}><Radio size={19}/>Home<span>01</span></button><button className={view.kind==='following'?'sidebar-item active':'sidebar-item'} onClick={openFollowing}><Users size={19}/>Following</button><button className={view.kind==='profile'&&view.fid===session?.fid?'sidebar-item active':'sidebar-item'} onClick={()=>session?openProfile(session.fid):setAccountOpen(true)}><UserRound size={19}/>My profile</button><button className={view.kind==='notifications'?'sidebar-item notifications-nav active':'sidebar-item notifications-nav'} onClick={()=>navigate('/notifications')}><Bell size={19}/>Notifications</button><button className={view.kind==='search'?'sidebar-item search-nav active':'sidebar-item search-nav'} aria-current={view.kind==='search'?'page':undefined} onClick={()=>navigate('/search')}><Search size={19}/>Search</button><button className="sidebar-item controls-nav" onClick={()=>setControls(true)}><SlidersHorizontal size={19}/>Feed controls</button><button className={view.kind==='settings'?'sidebar-item settings-nav active':'sidebar-item settings-nav'} aria-current={view.kind==='settings'?'page':undefined} onClick={()=>navigate('/settings')}><Settings size={19}/>Settings</button><div className="sidebar-bottom"><div className="sidebar-note"><span className="eyebrow">BUILD YOUR OWN</span><h3>The feed is yours.<br/>So is the infrastructure.</h3><p>Go from public reads to your own Snapchain node.</p><button className="text-button" onClick={openGuide}>Read the field guide <ArrowRight size={15}/></button></div><button className="sidebar-item account-sidebar" onClick={()=>session?lockSession():setAccountOpen(true)}>{session?<Lock size={18}/>:<KeyRound size={18}/>}<div>{session?`FID ${session.fid}`:'Connect account'}<small>{session?(session.remote?'Sign out of this session':'Lock this session'):'Approve or import an app key'}</small></div></button></div></aside>
  <section className="feed-column">{view.kind==='search'?<SearchPage config={config} onFound={openCast} onProfile={openProfile}/>:view.kind==='settings'?<SettingsPage config={config} session={session} info={info} nodeError={nodeError} filterMode={mode} onAccount={()=>setAccountOpen(true)} onLock={lockSession} onProfile={openProfile} onEditProfile={()=>setEditProfileOpen(true)} onFeedControls={()=>setControls(true)} onRefresh={()=>setRefresh(value=>value+1)} onGuide={openGuide}/>:view.kind==='notifications'?<NotificationsPage key={session?.fid||'signed-out'} config={config} fid={session?.fid} onConnect={()=>setAccountOpen(true)} onProfile={openProfile} onCast={openCast}/>:view.kind==='connections'?<ConnectionsPage key={`${view.fid}:${view.tab}`} config={config} fid={view.fid} kind={view.tab} onProfile={openProfile} onTab={kind=>navigate(`/profile/${view.fid}/${kind}`)}/>:view.kind==='cast'?<CastDetail config={config} fid={view.fid} hash={view.hash} tab={view.tab} onTab={tab=>{history.replaceState(history.state,'',`/cast/${view.fid}/${view.hash}${tab==='replies'?'':`?tab=${tab}`}`);setView({...view,tab});}} handlers={handlers} revision={refresh} sessionFid={session?.fid} busy={Boolean(actionBusy)} onBack={()=>{if(history.state?.freecast)history.back();else navigate(`/profile/${view.fid}`);}}/>:<><div className="feed-title"><div><div className="eyebrow">YOUR NODE. YOUR FEED.</div><h1>{view.kind==='home'?'Home':view.kind==='profile'?'Profile':'Following'}<span>✳</span></h1></div><button className="icon-button" aria-label="Refresh feed" onClick={()=>setRefresh(v=>v+1)} disabled={busy}><RefreshCw size={18} className={busy?'spin':''}/></button></div><div className="feed-tabs"><button className={feed==='following'?'selected':''} onClick={()=>navigate('/')}>Following</button><button className={feed==='profile'?'selected':''} onClick={()=>session?openProfile(session.fid):setAccountOpen(true)}>My profile</button><button onClick={()=>setControls(true)}><SlidersHorizontal size={14}/>{mode==='all'?'All clients':`${mode==='include'?'Include':'Exclude'} filter`}</button></div>
  {feed==='following'&&<div className="profile-picker">{!session&&<form onSubmit={e=>{e.preventDefault();const n=Number(fidInput);if(Number.isSafeInteger(n)&&n>0){setHomeFid(n);setRefresh(v=>v+1);}else setError('Enter a positive numeric FID.');}}><span>FID</span><input aria-label="Following feed FID" type="number" min="1" value={fidInput} onChange={e=>setFidInput(e.target.value)} required/><button aria-label="Load following feed"><ArrowRight size={16}/></button></form>}<div><strong>{session?'Accounts you follow':`Accounts ${profiles[feedFid]?.username?`@${profiles[feedFid].username}`:`FID ${feedFid}`} follows`}</strong><small>{session?'Casts from your following list':'Public feed preview · connect to use your following list'}</small></div>{!session&&<button className="button small-button" onClick={()=>setAccountOpen(true)}>Connect</button>}</div>}
  {view.kind==='profile'&&<ProfileHeader key={fid} onProfile={openProfile} config={config} fid={fid} viewerFid={session?.fid} onConnections={kind=>navigate(`/profile/${fid}/${kind}`)} onFollow={toggleFollow} followed={followed.has(fid)} busy={Boolean(actionBusy)} ownProfile={session?.fid===fid} revision={refresh} onEdit={()=>setEditProfileOpen(true)}/>}
  {(view.kind!=='profile'||session?.fid===fid)&&<div className="composer"><Avatar p={session?profiles[session.fid]:undefined}/><div><MentionComposer config={config} value={text} mentions={draftMentions} candidates={Object.values(profiles)} onChange={(value,mentions)=>{setText(value);setDraftMentions(mentions);}} placeholder={session?'What would you like to put into the world?':'Your next cast starts here.'} label="Cast text" rows={3}/><ComposerUsage usage={usage} limits={limits}/><ImageAttachments images={images} max={maximum} reserved={links.urls.length} onChange={setImages} onBusy={setUploading} disabled={publishing||!session}/><LinkAttachments links={links} available={maximum-images.length} disabled={publishing||uploading||!session}/><div className="composer-bottom"><span>{session?<><span className="live-dot"/> Signing as FID {session.fid}</>:<><Lock size={12}/> Connect your account to publish</>}</span><button className="button primary small-button" disabled={publishing||uploading||Boolean(session&&usage.error)} onClick={async()=>{if(!session){setAccountOpen(true);return;}setPublishing(true);setError('');try{const hash=await postCast(config,session,text,undefined,undefined,draftMentions,images,links.urls);links.reset();setImages([]);setText('');setDraftMentions([]);published(session.fid,hash);setRefresh(v=>v+1);}catch(e){setError((e as Error).message);}finally{setPublishing(false);}}}>{publishing?'Confirming inclusion…':'Publish cast'}<ArrowUpRight size={14}/></button></div></div></div>}
  {error&&<div className="feed-message error" role="alert"><AlertCircle size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}{notice&&<div className="feed-message notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice('')}>×</button></div>}
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
  <div className="feed-count"><span>{busy&&!filtered.length?'READING FROM YOUR NODE':`${filtered.length} ${castType.toUpperCase()}${mode!=='all'?' · FILTERED':''}`}</span>{attributing&&<span role="status">Resolving client keys…</span>}<select className="feed-order" aria-label={likesView?'Like order':'Chronological order'} value={order} onChange={e=>setOrder(e.target.value as 'newest'|'oldest')}><option value="newest">{likesView?'Recently liked':'Newest first'}</option><option value="oldest">{likesView?'Oldest likes first':feed==='following'?'Oldest loaded first':'Oldest first'}</option></select></div>
  <div id="cast-feed" role={feed==='profile'?'tabpanel':'region'} aria-labelledby={feed==='profile'?`${castType}-tab`:undefined} aria-label={feed==='following'?'Following posts':undefined} aria-busy={busy}>
  {busy&&!filtered.length?<div className="loading"><span className="loader"/><p>Reading the network…</p></div>:filtered.length?filtered.map(renderCast):<div className="empty"><Radio size={30}/><h3>{error?'The feed is unavailable':`No ${castType} in this view`}</h3><p>{error?'Check your node connection and refresh.':hasMore?`No ${castType} match the loaded pages. Load more or adjust your client filter.`:feed==='following'?(session?'Follow some accounts to fill your home feed, or adjust your client filter.':'Try another public FID or connect your account to see casts from accounts you follow.'):`Try another FID or adjust your client filter.`}</p></div>}
  {hasMore&&<button className="load-more" disabled={busy} onClick={()=>loadMore()}>{busy?'Reading…':feed==='following'?'Load next 12 followed profiles':likesView?(order==='newest'?'Load older likes':'Load newer likes'):order==='newest'?'Load older casts':'Load newer casts'} <ArrowRight size={15}/></button>}{feed==='following'&&<p className="feed-limit">Showing up to 15 recent casts per followed account, loaded in batches of 12 accounts.</p>}
  </div>
  </>}

  {(view.kind==='cast'||view.kind==='settings')&&error&&<div className="feed-message error" role="alert">{error}</div>}
  {(view.kind==='cast'||view.kind==='settings')&&notice&&<div className="feed-message notice" role="status">{notice}</div>}
  {editingCast&&!editCastOpen&&session?.fid===editingCast.data.fid&&<div className="feed-message notice" role="status"><span>Your cast edit is still pending.</span><button type="button" className="text-button" onClick={()=>setEditCastOpen(true)}>Resume cast edit</button></div>}
  </section><aside className="client-right"><div className="node-card"><div className="card-label"><Server size={16}/><span>READ NODE</span><span className={info?'status-pill':'status-pill offline'}>{info?'Connected':nodeError?'Unavailable':'Checking'}</span></div><h3>Your window<br/>into the network.</h3><a className="node-url" href={`${config.readUrl}/v1/info`} target="_blank" rel="noreferrer">{new URL(config.readUrl).hostname}<ArrowUpRight size={13}/></a><div className="node-stats"><div><span>VERSION</span><strong>{info?.version||'—'}</strong></div><div><span>SHARD DELAY</span><strong>{info?`${Math.max(...info.shardInfos.map(s=>s.blockDelay))}s`:'—'}</strong></div></div>{nodeError&&<p className="small danger">{nodeError}</p>}<div className="node-card-footer"><span className="live-dot"/> Operator-configured read node</div></div><div className="write-card"><div className="card-label"><ArrowUpRight size={16}/>WRITE PATH</div><h4>Signed here.<br/>Included by a validator.</h4><p>{config.validatorUrl?new URL(config.validatorUrl).hostname:'Set VALIDATOR_URL in your local .env to enable writes.'}</p></div><div className="protocol-note"><span className="eyebrow">GOOD TO KNOW</span><p>A username can change.<br/>An FID is your stable identity.</p><button className="text-button" onClick={openGuide}>Meet the protocol <ArrowRight size={14}/></button></div><div className="sidebar-fineprint">NO READ-PROVIDER API KEY<br/>NO ALGORITHMIC RANKING<br/>OPEN SOURCE / MIT</div></aside>
  {deletePending&&<Modal title="Delete this cast?" onClose={()=>{if(!deleting)setDeletePending(null);}}><p>This permanently removes your cast from Farcaster. This action cannot be undone.</p><div className="delete-confirm-actions"><button className="button" disabled={deleting} onClick={()=>setDeletePending(null)}>Cancel</button><button className="button delete-confirm" disabled={deleting} onClick={async()=>{
    if(!session||session.fid!==deletePending.data.fid){setError('Connect the account that owns this cast.');return;}
    const target=deletePending;setDeleting(true);setError('');
    try{await deleteCast(config,session,target);setDeletePending(null);setCasts(previous=>previous.filter(c=>c.hash!==target.hash));setNotice('Cast deleted');if(view.kind==='cast'&&view.hash===target.hash)openProfile(session.fid);setRefresh(value=>value+1);}
    catch(error){setError((error as Error).message);}finally{setDeleting(false);}
  }}>{deleting?'Deleting…':'Delete cast'}</button></div>{error&&<div className="feed-message error" role="alert">{error}</div>}</Modal>}
  {composing&&<Modal title={quote?'Quote cast':'Reply to cast'} onClose={()=>{if(!publishing){setReply(null);setQuote(null);setReplyImages([]);}}}>
    <div className="composer reply-modal-composer"><div><MentionComposer config={config} inputRef={replyComposer} value={replyText} mentions={replyMentions} candidates={Object.values(profiles)} onChange={(value,mentions)=>{setReplyText(value);setReplyMentions(mentions);}} placeholder={quote?'Add your thoughts…':'Write your reply…'} label={quote?'Quote text':'Reply text'} rows={4}/><ComposerUsage usage={replyUsage} limits={limits}/><ImageAttachments images={replyImages} reserved={replyLinks.urls.length+(quote?1:0)} onChange={setReplyImages} onBusy={setReplyUploading} max={maximum} disabled={publishing||!session}/><LinkAttachments links={replyLinks} available={maximum-(quote?1:0)-replyImages.length} disabled={publishing||replyUploading||!session}/>
    {quote?<QuotedCast config={config} fid={quote.data.fid} hash={quote.hash} visible onOpen={cast=>{setQuote(null);openCast(cast);}} onProfile={fid=>{setQuote(null);openProfile(fid);}}/>:<p className="small muted">Replying to FID {composing.data.fid} · <a className="text-button" href={castPath(composing)} onClick={event=>{event.preventDefault();openCast(composing);setReply(null);}}>View original cast</a></p>}
    <div className="composer-bottom"><span>{session?`Signing as FID ${session.fid}`:'Connect your account to publish'}</span><button className="button primary small-button" disabled={publishing||replyUploading||Boolean(session&&replyUsage.error)||Boolean(session&&!replyText.trim()&&!quote&&!replyImages.length&&!replyLinks.urls.length)} onClick={async()=>{
      if(!session){setReply(null);setQuote(null);setAccountOpen(true);return;}
      setPublishing(true);setError('');
      try{const hash=await postCast(config,session,replyText,reply||undefined,quote||undefined,replyMentions,replyImages,replyLinks.urls);replyLinks.reset();setReplyImages([]);setReplyText('');setReplyMentions([]);setReply(null);setQuote(null);published(session.fid,hash);setRefresh(value=>value+1);}
      catch(error){setError((error as Error).message);}finally{setPublishing(false);}
    }}>{publishing?'Publishing…':session?(quote?'Publish quote':'Publish reply'):'Connect to publish'}</button></div></div></div>{error&&<div className="feed-message error" role="alert">{error}</div>}
  </Modal>}

  {editingCast&&session?.fid===editingCast.data.fid&&<EditCast key={`${session.key}:${editingCast.hash}`} config={config} session={session} cast={editingCast} open={editCastOpen} onClose={pending=>{setEditCastOpen(false);if(!pending)setEditingCast(null);}} onDeleted={()=>setCasts(value=>value.filter(cast=>cast.hash!==editingCast.hash))} onPublished={hash=>{setEditingCast(null);setEditCastOpen(false);published(session.fid,hash);setRefresh(value=>value+1);navigate(`/cast/${session.fid}/${hash}`);}}/>}
  {editProfileOpen&&session&&<EditProfile key={session.key} config={config} session={session} onClose={()=>setEditProfileOpen(false)} onConnect={()=>{setEditProfileOpen(false);setAccountOpen(true);}} onSaved={()=>{setNotice('Profile updated');profile(config,session.fid).then(person=>setProfiles(value=>({...value,[person.fid]:person}))).catch(()=>{});setRefresh(value=>value+1);}}/>}
  {accountOpen&&<Suspense fallback={<div className="feed-message notice" role="status">Opening local account tools…</div>}><Account config={config} onSession={s=>{setSession(s);profile(config,s.fid).then(p=>setProfiles(v=>({...v,[s.fid]:p}))).catch(()=>{});}} onClose={()=>setAccountOpen(false)}/></Suspense>}
  {controls&&<FeedControls initial={{mode,clientFids,signerKeys}} onClose={()=>setControls(false)} onApply={filters=>{setMode(filters.mode);setClientFids(filters.clientFids);setSignerKeys(filters.signerKeys);setControls(false);}}/>}
  </main>;
}
