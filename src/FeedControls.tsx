import { useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Modal } from './components';
import { filterTokens, knownClients, type Filters } from './lib/feed-filters';

const knownFids=new Set<number>(knownClients.map(client=>client.fid));
const emptyFilters:Filters={mode:'all',clientFids:'',signerKeys:'',selfRegistered:false};
export function FeedControls({initial,onApply,onClose}:{initial:Filters;onApply:(filters:Filters)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(initial),[error,setError]=useState(''),[customOpen,setCustomOpen]=useState(false);
  const [otherFids,setOtherFids]=useState(()=>filterTokens(initial.clientFids).filter(fid=>!knownFids.has(Number(fid))).join(', '));
  const fidInput=useRef<HTMLInputElement>(null),keyInput=useRef<HTMLTextAreaElement>(null),id=useId();
  const fids=filterTokens(draft.clientFids),keys=filterTokens(draft.signerKeys);
  const customCount=new Set(fids.filter(fid=>!knownFids.has(Number(fid)))).size+new Set(keys.map(key=>key.toLowerCase())).size;
  const selectedCount=new Set(fids).size+new Set(keys.map(key=>key.toLowerCase())).size+Number(draft.selfRegistered);
  function toggleClient(fid:number) {
    setError('');setOtherFids(value=>filterTokens(value).filter(token=>Number(token)!==fid).join(', '));
    setDraft(previous=>{
      const values=filterTokens(previous.clientFids),selected=values.some(value=>Number(value)===fid);
      return {...previous,mode:previous.mode==='all'?'include':previous.mode,clientFids:[...values.filter(value=>Number(value)!==fid),...(selected?[]:[String(fid)])].join(', ')};
    });
  }
  function apply() {
    const clientIds=filterTokens(draft.clientFids).map(Number),appKeys=filterTokens(draft.signerKeys);
    if(clientIds.some(value=>!Number.isSafeInteger(value)||value<=0)){
      setCustomOpen(true);setError('Use positive numeric client FIDs.');requestAnimationFrame(()=>fidInput.current?.focus());return;
    }
    if(appKeys.some(key=>!/^0x[0-9a-fA-F]{64}$/.test(key))){
      setCustomOpen(true);setError('Each public key must start with 0x and contain 64 hexadecimal digits.');requestAnimationFrame(()=>keyInput.current?.focus());return;
    }
    if(draft.mode!=='all'&&!clientIds.length&&!appKeys.length&&!draft.selfRegistered){setError('Select a client or choose All clients.');return;}
    onApply({...draft,clientFids:[...new Set(clientIds)].join(', '),signerKeys:[...new Set(appKeys.map(key=>key.toLowerCase()))].join(', ')});
  }
  return <Modal title="Feed filters" className="feed-controls" onClose={onClose}>
    <form className="filter-form" onSubmit={event=>{event.preventDefault();apply();}}>
      <div className="filter-body">
        <div className="filter-modes" role="group" aria-label="Client filter mode">
          {([{mode:'all',label:'All clients'},{mode:'include',label:'Include'},{mode:'exclude',label:'Exclude'}] as const).map(({mode,label})=><button type="button" key={mode} aria-pressed={draft.mode===mode} onClick={()=>{setError('');setDraft(value=>({...value,mode}));}}>{label}</button>)}
        </div>
        <p className="filter-description">{draft.mode==='all'?(selectedCount?'Showing all clients. Your selections are kept.':'Show casts from every client.'):draft.mode==='include'?'Show only selected clients. Unidentified clients are hidden.':'Hide selected clients. Unidentified clients stay visible.'}</p>
        <fieldset className="filter-client-options"><legend>Clients</legend><div className="filter-client-chips">
          {knownClients.map(client=>{
            const selected=fids.some(fid=>Number(fid)===client.fid);
            return <button type="button" key={client.fid} className="filter-client-chip" aria-pressed={selected} title={`Client FID ${client.fid}`} onClick={()=>toggleClient(client.fid)}><span className="filter-client-check" aria-hidden="true">{selected&&<Check size={13}/>}</span>{client.name}</button>;
          })}
          <button type="button" className="filter-client-chip" aria-pressed={draft.selfRegistered} title="Clients such as Kite, where the client FID matches the cast author’s FID" onClick={()=>{setError('');setDraft(value=>({...value,selfRegistered:!value.selfRegistered,mode:value.mode==='all'?'include':value.mode}));}}><span className="filter-client-check" aria-hidden="true">{draft.selfRegistered&&<Check size={13}/>}</span>Self-registered</button>
        </div></fieldset>
        <div className="filter-custom">
          <button type="button" className="filter-custom-toggle" aria-expanded={customOpen} aria-controls={`${id}-custom`} onClick={()=>setCustomOpen(value=>!value)}><span>Custom clients{customCount>0&&<span className="filter-custom-count">{customCount}</span>}<small>Client FIDs and app public keys</small></span><ChevronDown size={18}/></button>
          <div id={`${id}-custom`} className="filter-custom-fields" hidden={!customOpen}>
            <label>Client FIDs<input ref={fidInput} value={otherFids} onChange={event=>{const value=event.target.value;setError('');setOtherFids(value);setDraft(previous=>({...previous,mode:previous.mode==='all'&&value.trim()?'include':previous.mode,clientFids:[...filterTokens(previous.clientFids).filter(fid=>knownFids.has(Number(fid))),value].filter(Boolean).join(', ')}));}} placeholder="123, 456" aria-describedby={error?`${id}-error`:undefined}/></label>
            <label>App public keys<textarea ref={keyInput} rows={2} value={draft.signerKeys} onChange={event=>{const value=event.target.value;setError('');setDraft(previous=>({...previous,signerKeys:value,mode:previous.mode==='all'&&value.trim()?'include':previous.mode}));}} placeholder="0x followed by 64 hexadecimal digits" aria-describedby={error?`${id}-error`:undefined}/></label>
            <p className="filter-custom-hint">Separate multiple FIDs or public keys with commas or spaces.</p>
          </div>
        </div>
        {error&&<p id={`${id}-error`} className="filter-error" role="alert">{error}</p>}
      </div>
      <div className="filter-footer"><button type="button" className="button" onClick={()=>{setDraft({...emptyFilters});setOtherFids('');setError('');}}>Reset</button><button type="submit" className="button primary">Apply filters</button></div>
    </form>
  </Modal>;
}
