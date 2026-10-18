import {useEffect,useId,useRef,useState,type RefObject} from 'react';
import {hub,profile,type Config,type Profile} from './lib/hub';
import {editMentions,mentionQuery,type DraftMention} from './lib/mentions';
import {Avatar} from './social-ui';

export function MentionComposer({config,value,mentions,onChange,candidates,label,placeholder,rows=3,inputRef}:{config:Config;value:string;mentions:DraftMention[];onChange:(value:string,mentions:DraftMention[])=>void;candidates:Profile[];label:string;placeholder:string;rows?:number;inputRef?:RefObject<HTMLTextAreaElement|null>}){
  const ownRef=useRef<HTMLTextAreaElement>(null),ref=inputRef||ownRef,id=useId();
  const [caret,setCaret]=useState(value.length),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(''),[exact,setExact]=useState<Profile>(),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[selected,setSelected]=useState(0);
  const query=focused?mentionQuery(value,caret):undefined,key=query?`${query.start}:${query.query}`:'';
  const open=Boolean(query&&key!==dismissed);
  useEffect(()=>{
    setExact(undefined);setLoading(false);setFailed(false);setSelected(0);
    if(!open||!query?.query)return;
    let active=true;const controller=new AbortController(),name=query.query;
    setLoading(true);
    const timer=setTimeout(()=>{
      hub<{fid:number}>(config,'userNameProofByName',{name},controller.signal).then(proof=>{
        if(!Number.isSafeInteger(proof.fid)||proof.fid<=0)throw new Error('Unassigned username.');
        return profile(config,proof.fid);
      }).then(person=>{if(active&&person.username.toLowerCase()===name)setExact(person);}).catch(error=>{
        if(active&&!/^Node returned (400|404):/.test((error as Error).message)&&!controller.signal.aborted)setFailed(true);
      }).finally(()=>{if(active)setLoading(false);});
    },250);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[config,key,open]);
  const options=[...new Map([...(exact?[exact]:[]),...candidates].filter(person=>person.username&&person.username.toLowerCase().startsWith(query?.query||'')).map(person=>[person.fid,person])).values()].slice(0,6);
  function choose(person:Profile){
    if(!query)return;
    const username=`@${person.username}`,insert=username+(query.end===value.length?' ':''),next=value.slice(0,query.start)+insert+value.slice(query.end);
    const updated=editMentions(value,next,mentions),end=query.start+username.length;
    onChange(next,[...updated.filter(mention=>mention.end<=query.start||mention.start>=end),{start:query.start,end,fid:person.fid,label:username}].sort((a,b)=>a.start-b.start));
    const position=query.start+insert.length;setCaret(position);setDismissed('');
    requestAnimationFrame(()=>{ref.current?.focus();ref.current?.setSelectionRange(position,position);});
  }
  return <div className="mention-composer">
    <textarea ref={ref} value={value} rows={rows} placeholder={placeholder} aria-label={label} aria-autocomplete="list" aria-controls={open?id:undefined} aria-activedescendant={open&&options[selected]?`${id}-${selected}`:undefined} onFocus={event=>{setFocused(true);setCaret(event.currentTarget.selectionStart);}} onBlur={()=>setFocused(false)} onSelect={event=>setCaret(event.currentTarget.selectionStart)} onChange={event=>{const next=event.target.value;onChange(next,editMentions(value,next,mentions));setCaret(event.target.selectionStart);setDismissed('');}} onKeyDown={event=>{
      if(!open||event.nativeEvent.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissed(key);return;}
      if(options.length&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();setSelected(index=>(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length);}
      if(options.length&&['Enter','Tab'].includes(event.key)){event.preventDefault();event.stopPropagation();choose(options[Math.min(selected,options.length-1)]);}
    }}/>
    {open&&<div className="mention-suggestions" id={id} role="listbox" aria-label="Mention suggestions">{options.map((person,index)=><button key={person.fid} id={`${id}-${index}`} role="option" tabIndex={-1} aria-selected={selected===index} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(person)}><Avatar person={person}/><span><strong>{person.name}</strong><small>@{person.username}</small></span></button>)}{loading&&<p role="status">Looking up @{query?.query}…</p>}{!loading&&!options.length&&<p role="status">{failed?'Could not look up this username. Try typing it again.':'Type a full username to find an account.'}</p>}</div>}
    <p className="mention-hint">Type @ and select an account to mention it.</p>
  </div>;
}
