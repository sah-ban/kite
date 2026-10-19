import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal } from './components';
import { filterTokens, knownClients, type Filters } from './lib/feed-filters';

export function FeedControls({initial,onApply,onClose}:{initial:Filters;onApply:(filters:Filters)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial),[error,setError]=useState('');
  const knownFids = new Set<number>(knownClients.map(client => client.fid));
  const fids = filterTokens(draft.clientFids);
  const [otherFids,setOtherFids] = useState(() => filterTokens(initial.clientFids).filter(fid => !knownFids.has(Number(fid))).join(', '));
  function toggleClient(fid: number, checked: boolean) {
    setError('');
    setDraft({...draft, mode: draft.mode === 'all' ? 'include' : draft.mode,
      clientFids: [...fids.filter(value => Number(value) !== fid), ...(checked ? [String(fid)] : [])].join(', ')});
  }
  return <Modal title="Feed controls" onClose={onClose}>
    <p>Choose which clients appear in your feed. Select one or more clients, then include or exclude their casts.</p>
    <label>Client filter<select value={draft.mode} onChange={e=>{setError('');setDraft({...draft,mode:e.target.value as Filters['mode']});}}>
      <option value="all">Show all clients</option><option value="include">Include selected clients only</option><option value="exclude">Exclude selected clients</option>
    </select></label>
    <fieldset className="client-filter-options"><legend>Known clients</legend>
      {knownClients.map(client => <label className="client-filter-option" key={client.fid}>
        <input type="checkbox" checked={fids.some(fid => Number(fid) === client.fid)} onChange={event => toggleClient(client.fid, event.target.checked)}/>
        <span><strong>{client.name}</strong><small>{'username' in client ? `@${client.username} · ` : ''}Client FID {client.fid}</small></span>
      </label>)}
    </fieldset>
    <fieldset className="client-filter-options"><legend>Custom clients</legend>
      <label className="client-filter-option"><input type="checkbox" checked={draft.selfRegistered} onChange={event => {setError('');setDraft({...draft,selfRegistered:event.target.checked,mode:draft.mode==='all'?'include':draft.mode});}}/>
        <span><strong>Self-registered clients</strong><small>Clients like Freecast, where the client FID matches the cast author’s FID.</small></span>
      </label>
    </fieldset>
    <label>Other client FIDs<input value={otherFids} onChange={event=>{setError('');setOtherFids(event.target.value);setDraft({...draft,clientFids:[...fids.filter(fid => knownFids.has(Number(fid))),event.target.value].filter(Boolean).join(', ')});}} placeholder="Add client FIDs, separated by commas"/></label>
    <details className="client-filter-advanced"><summary>Advanced: exact app public keys</summary><label>App public keys<textarea rows={3} value={draft.signerKeys} onChange={e=>{setError('');setDraft({...draft,signerKeys:e.target.value});}} placeholder="0x followed by 64 hexadecimal digits"/></label></details>
    <p className="small muted">A cast matches any selected client, custom FID, or app key. Client identity comes from signer registration, including gasless keys supported by your node. Unidentified clients are hidden by Include and kept by Exclude.</p>
    {error&&<div className="error" role="alert">{error}</div>}
    <button className="button primary full" onClick={()=>{
      const clientIds=filterTokens(draft.clientFids).map(Number),keys=filterTokens(draft.signerKeys);
      if(clientIds.some(n=>!Number.isSafeInteger(n)||n<=0)||keys.some(k=>!/^0x[0-9a-fA-F]{64}$/.test(k))){setError('Use positive client FIDs and 32-byte signer public keys.');return;}
      if(draft.mode!=='all'&&!clientIds.length&&!keys.length&&!draft.selfRegistered){setError('Select at least one client, enter a client FID or app key, or choose Show all clients.');return;}
      onApply({...draft,clientFids:[...new Set(clientIds)].join(', '),signerKeys:[...new Set(keys.map(key=>key.toLowerCase()))].join(', ')});
    }}>Apply feed controls <ArrowRight size={16}/></button>
  </Modal>;
}
