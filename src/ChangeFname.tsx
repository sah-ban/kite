import { useEffect, useRef, useState } from 'react';
import type { Config } from './lib/hub';
import { localOrigin } from './lib/hub';
import type { Session } from './lib/signing';
import { claimableFname, fnameCheckError, inspectFnameChange, prepareFnameChange, type FnameCheck, type PreparedFnameChange } from './lib/fname';

export function ChangeFname({config,session,username,disabled,onBusy,onChanged}:{config:Config;session:Session;username:string;disabled:boolean;onBusy:(value:boolean)=>void;onChanged:(name:string)=>void}) {
  const [open,setOpen]=useState(false),[name,setName]=useState(''),[phrase,setPhrase]=useState(''),[index,setIndex]=useState('0'),[check,setCheck]=useState<FnameCheck>(),[checkError,setCheckError]=useState(''),[checking,setChecking]=useState(false),[refresh,setRefresh]=useState(0);
  const [prepared,setPrepared]=useState<PreparedFnameChange>(),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[success,setSuccess]=useState('');
  const lifetime=useRef<AbortController|null>(null),pending=useRef<PreparedFnameChange|undefined>(undefined);
  useEffect(()=>{const abort=new AbortController();lifetime.current=abort;return()=>{abort.abort();pending.current?.discard();onBusy(false);};},[onBusy]);
  useEffect(()=>{
    const abort=new AbortController();setCheck(undefined);setCheckError('');setChecking(false);
    if(!open||prepared||!name.trim())return()=>abort.abort();
    try{claimableFname(name);}catch(error){setCheckError((error as Error).message);return()=>abort.abort();}
    setChecking(true);const timer=setTimeout(()=>{
      inspectFnameChange(session.fid,name,abort.signal).then(value=>{if(!abort.signal.aborted)setCheck(value);}).catch(error=>{if(!abort.signal.aborted)setCheckError((error as Error).message);}).finally(()=>{if(!abort.signal.aborted)setChecking(false);});
    },350);
    return()=>{clearTimeout(timer);abort.abort();};
  },[open,name,session.fid,prepared,refresh]);
  if(!localOrigin())return null;
  const problem=check?fnameCheckError(check):checkError,needsConfirmation=Boolean(prepared?.review.currentName&&!prepared.review.alreadyOwned);
  function reset(){pending.current?.discard();pending.current=undefined;setPrepared(undefined);setPhrase('');setError('');setSuccess('');setProgress('');setConfirmed(false);}
  async function run(){
    if(!prepared||busy||disabled||needsConfirmation&&!confirmed)return;setBusy(true);onBusy(true);setError('');
    try{const result=await prepared.run(setProgress,lifetime.current?.signal);if(!lifetime.current?.signal.aborted){setSuccess(result);onChanged(result);}}
    catch(error){if(!lifetime.current?.signal.aborted)setError((error as Error).message);}
    finally{if(!lifetime.current?.signal.aborted){setBusy(false);onBusy(false);setProgress('');}}
  }
  return <section className="change-fname" aria-label="Change username">
    <div className="fname-heading"><div><h3>Username (fname)</h3><p className="small muted">{username?`Current profile username: @${username}`:`FID ${session.fid} has no preferred username.`}</p></div>{!open&&<button type="button" className="button small-button" disabled={disabled} onClick={()=>setOpen(true)}>Change username</button>}</div>
    {open&&(success?<><p role="status">Username updated to <strong>@{success}</strong>. The new fname has a 28-day cooldown before it can be changed again.</p><button type="button" className="button" onClick={()=>{reset();setOpen(false);setName('');}}>Done</button></>:prepared?<>
      <dl className="fname-review"><div><dt>FID</dt><dd>{session.fid}</dd></div><div><dt>Custody address</dt><dd>{prepared.review.owner}</dd></div><div><dt>Current fname</dt><dd>{prepared.review.currentName?`@${prepared.review.currentName}`:'None'}</dd></div><div><dt>New fname</dt><dd>@{prepared.review.name}</dd></div></dl>
      {prepared.review.alreadyOwned?<p>This FID already owns the new fname. Only the preferred profile username will be updated.</p>:<p className="fname-warning">{prepared.review.currentName?`@${prepared.review.currentName} will be released before @${prepared.review.name} is claimed. These are separate requests: availability can change, and the old name may not be reclaimable for 28 days.`:`This claims @${prepared.review.name} for your FID.`} A successful claim starts a new 28-day cooldown.</p>}
      {needsConfirmation&&<label className="fname-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/><span>I understand the old fname will be released and the new claim can still fail.</span></label>}
      {error&&<p className="danger" role="alert">{error}</p>}{progress&&<p role="status">{progress}</p>}
      {error&&<p className="small muted">Keep this page open to retry. Retry checks registry state first and continues from the confirmed step. Closing this form clears the custody key from this flow; it does not undo registry changes.</p>}
      <div className="fname-actions"><button type="button" className="button" disabled={busy} onClick={reset}>{error?'Choose another fname':'Back'}</button><button type="button" className="button primary" disabled={busy||disabled||needsConfirmation&&!confirmed} onClick={()=>void run()}>{busy?'Working…':error?'Retry and finish':prepared.review.alreadyOwned?'Update preferred username':prepared.review.currentName?'Release previous and claim fname':'Claim fname'}</button></div>
    </>:<form onSubmit={async event=>{
      event.preventDefault();if(busy||disabled||checking||!check||problem||!phrase.trim())return;setBusy(true);onBusy(true);setError('');const recovery=phrase;setPhrase('');
      try{const value=await prepareFnameChange(config,session,name,recovery,Number(index),lifetime.current?.signal);if(lifetime.current?.signal.aborted){value.discard();return;}pending.current=value;setPrepared(value);setConfirmed(false);}
      catch(error){if(!lifetime.current?.signal.aborted)setError((error as Error).message);}
      finally{if(!lifetime.current?.signal.aborted){setBusy(false);onBusy(false);}}
    }}>
      <p className="small muted">Available only on localhost. The custody recovery phrase stays in browser memory and is cleared from this field before review. Only signed public proofs are sent to the fname registry.</p>
      <label>New fname<input value={name} autoComplete="off" spellCheck={false} disabled={busy||disabled} placeholder="new-username" onChange={event=>{setName(event.target.value.toLowerCase().replace(/^@/,''));setError('');}} required/></label>
      {checking?<p className="small muted" role="status">Checking availability and 28-day cooldown…</p>:problem?<p className="small danger" role="status">{problem}</p>:check&&<p className="small muted" role="status">{check.alreadyOwned?'Already owned by this FID; ready to update the preferred username.':`@${check.name} is available and cooldown checks passed.`}</p>}
      {name.trim()&&<button type="button" className="text-button" disabled={busy||checking} onClick={()=>setRefresh(value=>value+1)}>Check again</button>}
      <label>Custody recovery phrase<textarea rows={3} autoComplete="off" spellCheck={false} disabled={busy||disabled} value={phrase} onChange={event=>setPhrase(event.target.value)} required/></label>
      <details className="custody-advanced">
        <summary>Advanced options</summary>
        <label>Address derivation index<input type="number" min="0" max="100" step="1" value={index} disabled={busy||disabled} onChange={event=>setIndex(event.target.value)} required/></label>
      </details>
      {error&&<p className="danger" role="alert">{error}</p>}
      <div className="fname-actions"><button type="button" className="button" disabled={busy} onClick={()=>{reset();setOpen(false);}}>Cancel</button><button type="submit" className="button primary" disabled={busy||disabled||checking||!check||Boolean(problem)||!phrase.trim()}>{busy?'Checking custody…':'Review username change'}</button></div>
    </form>)}
  </section>;
}
