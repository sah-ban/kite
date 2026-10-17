import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from './components';
export type Filters = { mode:'all'|'include'|'exclude'; clientFids:string; signerKeys:string };
export function FeedControls({initial,onApply,onClose}:{initial:Filters;onApply:(filters:Filters)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial),[error,setError]=useState('');
  return <Modal title="Feed controls" onClose={onClose}><p>Choose which app keys appear in your feed. Filter by client requester FID, exact signer key, or both.</p><label>Client filter<select value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value as Filters['mode']})}><option value="all">Show all clients</option><option value="include">Include matching clients only</option><option value="exclude">Exclude matching clients</option></select></label><label>Client requester FIDs<input value={draft.clientFids} onChange={e=>setDraft({...draft,clientFids:e.target.value})} placeholder="e.g. 9152, 12345"/></label><label>Exact app public keys<textarea rows={3} value={draft.signerKeys} onChange={e=>setDraft({...draft,signerKeys:e.target.value})} placeholder="0x followed by 64 hexadecimal digits"/></label><p className="small muted">Requester FIDs come from onchain signer registration metadata. Unknown keys are omitted by Include and kept by Exclude. Gasless client attribution is not yet resolved.</p>{error&&<div className="error" role="alert">{error}</div>}<button className="button primary full" onClick={()=>{
    const fids=draft.clientFids.split(/[\s,]+/).filter(Boolean).map(Number),keys=draft.signerKeys.split(/[\s,]+/).filter(Boolean);
    if(fids.some(n=>!Number.isSafeInteger(n)||n<=0)||keys.some(k=>!/^0x[0-9a-fA-F]{64}$/.test(k))){setError('Use positive client FIDs and 32-byte signer public keys.');return;}
    onApply(draft);
  }}>Apply feed controls <ArrowRight size={16}/></button></Modal>;
}
