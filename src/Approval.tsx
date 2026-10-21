import { useState, useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import type { RemoteSession } from './lib/signing';
import type {Config} from './lib/hub';
import {useProfile} from './social-ui';

type Status = {state:'none'|'pending'|'active';deepLinkUrl?:string;key?:string;message?:string;session?:RemoteSession};
async function accountRequest(path: 'start'|'session'|'logout'): Promise<Status> {
  const response = await fetch(`/api/auth/${path}`,{method:path==='session'?'GET':'POST',headers:path==='session'?{}:{'Content-Type':'application/json'},...(path==='session'?{}:{body:'{}'}),signal:AbortSignal.timeout(25_000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not connect your account.');
  return result;
}
export function Approval({config,onSession,onClose}:{config:Config;onSession:(s:RemoteSession)=>void;onClose:()=>void}) {
  const configured=Boolean(config.approvalConfigured);
  const [appFid,setAppFid]=useState<number>();
  const app=useProfile(config,appFid||0);
  const [link,setLink]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const secure = window.location.protocol==='https:' || ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  useEffect(()=>{
    if(!configured||!secure)return;
    const controller=new AbortController();
    fetch('/api/auth/app',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}).then(async response=>{
      if(!response.ok)return;const value=await response.json();
      if(!controller.signal.aborted&&Number.isSafeInteger(value.fid)&&value.fid>0)setAppFid(value.fid);
    }).catch(()=>{});
    return()=>controller.abort();
  },[configured,secure]);
  const image = useMemo(()=>{
    if (!link) return '';
    const code=qrcode(0,'M');code.addData(link);code.make();return code.createDataURL(5,12);
  },[link]);
  useEffect(()=>{
    if (!link) return;
    let active=true;let timer:ReturnType<typeof setTimeout>;
    const started=Date.now();
    async function poll() {
      try {
        const result=await accountRequest('session');
        if (!active) return;
        setError('');
        if (result.state==='active'&&result.session) {onSession({...result.session,remote:true});onClose();return;}
        if (result.state==='none'||Date.now()-started>10*60_000) {setLink('');setError('Approval expired. Create a new request.');return;}
        setMessage(result.message || 'Waiting for approval in Farcaster…');
        timer=setTimeout(poll,2000);
      } catch(e) {if(active){setError((e as Error).message);timer=setTimeout(poll,4000);}}
    }
    timer=setTimeout(poll,1500);
    return()=>{active=false;clearTimeout(timer);};
  },[link,onSession,onClose]);
  return <div className="approval">
    <p>Create a fresh signer and approve it in Farcaster. Your account's seed phrase is not requested. The delegated private key is stored encrypted on this server.</p>
    {configured&&<p className="signer-attribution-note">Your casts will be published by your account, with {appFid?<a href={`/profile/${appFid}`} target="_blank" rel="noopener noreferrer">{app?.username?`@${app.username}`:`FID ${appFid}`}</a>:'the configured app account'} shown as the client.</p>}
    {!secure&&<div className="note">Open this client through localhost or HTTPS to approve an account. This public HTTP view supports reading.</div>}
    {!configured&&<div className="note">The operator needs to configure a server-only developer app identity before approval requests can be created.</div>}
    {link?<>
      <img className="approval-qr" src={image} alt="Scan to approve this fresh Farcaster signer"/>
      <a className="button primary full" href={link} target="_blank" rel="noreferrer">Approve in Farcaster <ArrowUpRight size={16}/></a>
      <p className="small muted" role="status">{message || 'Waiting for approval in Farcaster…'}</p>
      <p className="small mono">Public signer key: {key}</p>
      <button className="text-button" onClick={async()=>{try{await accountRequest('logout');setLink('');setKey('');setError('');}catch(e){setError((e as Error).message);}}}>Cancel this approval</button>
    </>:<button disabled={!secure||!configured||busy} className="button primary full" onClick={async()=>{
      setBusy(true);setError('');
      try {
        const result=await accountRequest('start');
        if(result.state==='active'&&result.session){onSession({...result.session,remote:true});onClose();return;}
        if(!result.deepLinkUrl)throw new Error('Approval request did not return a link.');
        setLink(result.deepLinkUrl);setKey(result.key || '');
      }catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}>{busy?<><RefreshCw className="spin" size={16}/>Creating signer…</>:<>Create signer and show QR <ArrowUpRight size={16}/></>}</button>}
    {error&&<div className="error" role="alert">{error}</div>}
    <p className="small muted">Connections last up to 30 days and survive server restarts. Signing out removes the saved signer; it does not revoke the app key in Farcaster.</p>
  </div>;
}
