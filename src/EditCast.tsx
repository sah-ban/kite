import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Repeat2, RefreshCw, X } from 'lucide-react';
import { Modal } from './components';
import { MentionComposer } from './MentionComposer';
import { ImageAttachments } from './ImageAttachments';
import { LinkAttachments, useComposerLinks } from './LinkAttachments';
import { CastEmbeds } from './CastEmbeds';
import { QuotedCast } from './QuotedCast';
import { CastTime } from './CastTime';
import { type Cast, type Config } from './lib/hub';
import type { Session } from './lib/signing';
import { countLabel, readActivity, castPath, type Activity } from './lib/social';
import { encodedEditDraft, prepareReplacement, publishReplacement, readCastDraft, type EditCastDraft, type ReplacementAttempt } from './lib/cast-edit';
export function EditCast({config,session,cast,open,onClose,onPublished,onDeleted}:{config:Config;session:Session;cast:Cast;open:boolean;onClose:(pending:boolean)=>void;onPublished:(hash:string)=>void;onDeleted:()=>void}) {
  const [draft,setDraft]=useState<EditCastDraft>(),[initialText,setInitialText]=useState(''),[activity,setActivity]=useState<Activity>(),[retry,setRetry]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[progress,setProgress]=useState('');
  const attempt=useRef<ReplacementAttempt|null>(null),input=useRef<HTMLTextAreaElement>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    let active=true;
    readCastDraft(config,cast).then(value=>{if(active){setDraft(value);setInitialText(value.text);setTimeout(()=>input.current?.focus(),0);}}).catch(e=>{if(active)setError((e as Error).message);});
    return()=>{active=false;};
  },[config,cast,session.fid]);
  useEffect(()=>{let active=true;readActivity(config,cast,`edit:${retry}`).then(value=>{if(active)setActivity(value);});return()=>{active=false;};},[config,cast,retry]);
  const maximum=4;
  const links=useComposerLinks(draft?.text||'',draft?.embeds.flatMap(embed=>embed.url?[embed.url]:[])||[],maximum-(draft?.embeds.length||0));
  const effectiveDraft=draft?{...draft,embeds:[...draft.embeds,...links.urls.map(url=>({url}))]}:undefined;
  if(!open)return null;
  const frozen=busy||Boolean(attempt.current),locked=frozen||uploading;
  let validation='';if(effectiveDraft)try{encodedEditDraft(effectiveDraft);}catch(e){validation=(e as Error).message;}
  const originalDeleted=Boolean(attempt.current?.originalDeleted);
  return <Modal title="Edit cast" className="edit-cast-modal" onClose={()=>{if(!busy&&!uploading)onClose(Boolean(attempt.current));}}>
    <section className="previous-cast" aria-label="Previous cast">
      <div className="previous-cast-heading"><strong>Previous cast</strong><CastTime timestamp={cast.data.timestamp}/><button type="button" className="icon-button" aria-label="Refresh previous cast counts" disabled={busy||Boolean(attempt.current)} onClick={()=>setRetry(value=>value+1)}><RefreshCw size={14}/></button></div>
      <p className="previous-cast-text">{initialText||cast.data.castAddBody.text||'Cast with embeds'}</p>
      <div className="previous-cast-counts" aria-label="Previous cast engagement">{([['likes',Heart],['recasts',Repeat2],['replies',MessageCircle]] as const).map(([kind,Icon])=><span key={kind}><Icon size={14}/><strong>{activity?countLabel(activity[kind]):'…'}</strong> {kind}</span>)}</div>
      {activity&&Object.keys(activity.errors).length>0&&<p className="small muted">Some previous cast counts are unavailable.</p>}
    </section>
    <p className="edit-cast-warning">{originalDeleted?'The previous cast has been deleted. Your replacement draft is kept here until Snapchain accepts it.':'This deletes the previous cast and publishes a new cast. Likes, recasts and replies do not transfer to the replacement.'}</p>
    {draft?<form onSubmit={async event=>{
      event.preventDefault();if(busy||uploading||!activity||validation)return;setBusy(true);setError('');
      try{
        if(!attempt.current){setProgress('Preparing replacement…');attempt.current=await prepareReplacement(config,session,cast,effectiveDraft!);}
        const hash=await publishReplacement(config,session,cast,attempt.current,message=>{if(mounted.current)setProgress(message);},onDeleted);
        if(mounted.current)onPublished(hash);
      }catch(e){if(mounted.current)setError((e as Error).message);}
      finally{if(mounted.current){setBusy(false);setProgress('');}}
    }}>
      <fieldset disabled={locked} className="edit-cast-fields">
        <MentionComposer config={config} inputRef={input} value={draft.text} mentions={draft.mentions} candidates={[]} label="Edit cast text" placeholder="Edit your cast…" rows={5} onChange={(text,mentions)=>{setDraft({...draft,text,mentions});setError('');}}/>
        {draft.parentCastId&&<p className="small muted">Reply to FID {draft.parentCastId.fid} · Reply context preserved</p>}
        {draft.parentUrl&&<p className="small muted edit-parent-url">Context: {draft.parentUrl}</p>}
        <div className="edit-cast-embeds">{draft.embeds.map((embed,index)=><div className="edit-cast-embed" key={index}>
          <div className="edit-embed-heading"><strong>{embed.castId?'Quoted cast':`Embed ${index+1}`}</strong><button type="button" className="icon-button" aria-label={`Remove embed ${index+1}`} onClick={()=>{if(embed.url)links.remove(embed.url);setDraft({...draft,embeds:draft.embeds.filter((_,i)=>i!==index)});}}><X size={15}/></button></div>
          {embed.castId?<QuotedCast config={config} fid={embed.castId.fid} hash={embed.castId.hash} visible onOpen={value=>window.open(castPath(value),'_blank','noopener,noreferrer')} onProfile={fid=>window.open(`/profile/${fid}`,'_blank','noopener,noreferrer')}/>:<><label>Embed URL<input type="text" value={embed.url||''} onChange={event=>setDraft({...draft,embeds:draft.embeds.map((value,i)=>i===index?{url:event.target.value}:value)})}/></label><CastEmbeds urls={embed.url?[embed.url]:[]} visible/></>}
        </div>)}</div>
        <ImageAttachments images={[]} reserved={draft.embeds.length+links.urls.length} max={maximum} onChange={images=>setDraft({...draft,embeds:[...draft.embeds,...images.map(url=>({url}))]})} onBusy={setUploading} disabled={frozen}/>
        <LinkAttachments links={links} available={maximum-draft.embeds.length} disabled={locked}/>
      </fieldset>
      {validation&&<p className="danger" role="alert">{validation}</p>}
      {error&&<p className="danger" role="alert">{error}</p>}
      {progress&&<p role="status">{progress}</p>}
      {attempt.current&&!busy&&<p className="small muted">Keep this browser page open to resume this edit.</p>}
      <div className="edit-cast-actions"><button type="button" className="button" disabled={busy||uploading} onClick={()=>onClose(Boolean(attempt.current))}>{attempt.current?'Close and keep draft':'Cancel'}</button><button type="submit" className="button primary" disabled={busy||uploading||!activity||Boolean(validation)}>{busy?(progress||'Working…'):attempt.current?(originalDeleted?'Retry cast publication':'Retry delete and cast again'):'Delete previous and cast again'}</button></div>
    </form>:<p role="status">{error||'Preparing your cast…'}</p>}
  </Modal>;
}
