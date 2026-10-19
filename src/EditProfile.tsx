import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Modal } from './components';
import { profile, invalidateProfile, localOrigin, type Config } from './lib/hub';
import type { Session } from './lib/signing';
import { getProStatus } from './lib/pro';
import { uploadImage } from './lib/images';
import { canEditProfile, profileDraft, profileChanges, saveProfile, type ProfileDraft } from './lib/profile-edit';
const empty:ProfileDraft={name:'',bio:'',avatar:'',banner:'',website:''};
const ChangeFname=lazy(()=>import('./ChangeFname').then(module=>({default:module.ChangeFname})));
export function EditProfile({config,session,onClose,onSaved,onConnect}:{config:Config;session:Session;onClose:()=>void;onSaved:()=>void;onConnect:()=>void}) {
  const [draft,setDraft]=useState<ProfileDraft>(empty),[original,setOriginal]=useState<ProfileDraft>(empty),[username,setUsername]=useState('');
  const [loading,setLoading]=useState(true),[allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState(''),[retry,setRetry]=useState(0);
  const [pro,setPro]=useState<boolean|null>(null),[proError,setProError]=useState(''),[proRetry,setProRetry]=useState(0);
  const [fnameBusy,setFnameBusy]=useState(false);
  const lifetime=useRef<AbortController|null>(null);
  useEffect(()=>{
    const abort=new AbortController();lifetime.current=abort;setLoading(true);setError('');setAllowed(false);invalidateProfile(session.fid);
    Promise.all([profile(config,session.fid),canEditProfile(config,session,abort.signal)]).then(([person,allowed])=>{if(abort.signal.aborted)return;const value=profileDraft(person);setDraft(value);setOriginal(value);setUsername(person.username);setAllowed(allowed);}).catch(e=>{if(!abort.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>{abort.abort();};
  },[config,session.fid,session.key,session.remote,retry]);
  useEffect(()=>{
    const abort=new AbortController();setPro(null);setProError('');
    getProStatus(config,session.fid,abort.signal).then(value=>{if(!abort.signal.aborted)setPro(value);}).catch(()=>{if(!abort.signal.aborted)setProError('Could not verify Farcaster Pro status.');});
    return()=>abort.abort();
  },[config,session.fid,proRetry]);
  const locked=loading||busy||Boolean(uploading)||fnameBusy;
  let changed=false,validation='';try{changed=profileChanges(original,draft).length>0;}catch(e){validation=(e as Error).message;}
  function field(key:keyof ProfileDraft,value:string){if(key==='banner'&&pro!==true)return;setDraft(previous=>({...previous,[key]:value}));setError('');}
  return <Modal title="Edit profile" className="edit-profile-modal" onClose={()=>{if(!busy&&!uploading&&!fnameBusy)onClose();}}>
    {loading?<p role="status">Loading your profile…</p>:<>
      <p className="small muted">{username?`@${username}`:`FID ${session.fid}`}</p>
      {!allowed&&!error&&<div className="profile-permission-note" role="status"><p>This signer does not have profile editing permission. Your existing posting access still works. Connect an approved signer or register a new app key that includes profile editing.</p><button type="button" className="button small-button" onClick={onConnect}>Connect another signer</button></div>}
      <form onSubmit={async event=>{
        event.preventDefault();if(locked||!allowed||validation||!changed)return;setBusy(true);setError('');
        try{await saveProfile(config,session,original,draft,setProgress,lifetime.current?.signal);if(!lifetime.current?.signal.aborted){onSaved();onClose();}}
        catch(e){if(!lifetime.current?.signal.aborted)setError((e as Error).message);}
        finally{if(!lifetime.current?.signal.aborted){setBusy(false);setProgress('');}}
      }}>
        {(['banner','avatar'] as const).map(key=><div key={key} className={`profile-image-field profile-image-${key}`}>
          <div className="profile-image-title"><strong>{key==='avatar'?'Profile picture':'Banner'}</strong>{draft[key]&&<button type="button" className="text-button" disabled={locked||!allowed||(key==='banner'&&pro!==true)} onClick={()=>field(key,'')}>Remove</button>}</div>
          {key==='banner'&&pro!==true&&<div className="banner-pro-note"><p className="small muted" role="status">{proError|| (pro===false?'Requires Farcaster Pro':'Checking Farcaster Pro…')}</p>{proError&&<button type="button" className="text-button" onClick={()=>setProRetry(value=>value+1)}>Retry Pro check</button>}</div>}
          {draft[key]&&<img key={draft[key]} src={draft[key]} alt={key==='avatar'?'Profile picture preview':'Banner preview'} referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>}
          <label className="profile-upload"><ImagePlus size={15}/>{uploading===key?'Uploading…':'Upload image'}<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={locked||!allowed||(key==='banner'&&pro!==true)} onChange={async event=>{
            const file=event.target.files?.[0];event.target.value='';if(!file||locked||!allowed||(key==='banner'&&pro!==true))return;setUploading(key);setError('');
            const signal=AbortSignal.any([lifetime.current!.signal,AbortSignal.timeout(65_000)]);
            try{const url=await uploadImage(file,signal);if(!signal.aborted)field(key,url);}
            catch(e){if(!lifetime.current?.signal.aborted)setError(signal.aborted?'Image upload timed out. Please try again.':(e as Error).message);}
            finally{if(!lifetime.current?.signal.aborted)setUploading('');}
          }}/></label>
          <label>{key==='avatar'?'Profile picture URL':'Banner URL'}<input type="url" value={draft[key]} disabled={locked||!allowed||(key==='banner'&&pro!==true)} placeholder="https://…" onChange={event=>field(key,event.target.value)}/></label>
        </div>)}
        <label>Display name <span className="profile-field-count">{new TextEncoder().encode(draft.name).length}/32 bytes</span><input value={draft.name} disabled={locked||!allowed} onChange={event=>field('name',event.target.value)}/></label>
        <label>Bio <span className="profile-field-count">{new TextEncoder().encode(draft.bio).length}/256 bytes</span><textarea rows={4} value={draft.bio} disabled={locked||!allowed} onChange={event=>field('bio',event.target.value)}/></label>
        <label>Website<input type="url" placeholder="https://…" value={draft.website} disabled={locked||!allowed} onChange={event=>field('website',event.target.value)}/></label>
        {validation&&<p className="danger" role="alert">{validation}</p>}
        {progress&&<p role="status">{progress}</p>}
        <div className="profile-edit-actions"><button type="button" className="button" disabled={busy||Boolean(uploading)||fnameBusy} onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={locked||!allowed||!changed||Boolean(validation)}>{busy?'Saving…':'Save profile'}</button></div>
      </form>
      {localOrigin()&&<Suspense fallback={<p className="small muted">Loading username tools…</p>}><ChangeFname config={config} session={session} username={username} disabled={loading||busy||Boolean(uploading)||!allowed} onBusy={setFnameBusy} onChanged={name=>{setUsername(name);onSaved();}}/></Suspense>}
    </>}
    {error&&<div className="profile-edit-error"><p className="danger" role="alert">{error}</p>{!allowed&&<button type="button" className="text-button" onClick={()=>setRetry(value=>value+1)}>Retry loading profile</button>}</div>}
  </Modal>;
}
