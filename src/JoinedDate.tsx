import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
export function JoinedDate({fid,revision=0}:{fid:number;revision?:number}) {
  const [record,setRecord]=useState<{fid:number;timestamp:number}>();
  useEffect(()=>{
    const abort=new AbortController();setRecord(undefined);
    fetch(`/api/profile/joined?${new URLSearchParams({fid:String(fid)})}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15_000)])}).then(async response=>{
      if(!response.ok)throw new Error('Unavailable');const data=await response.json();
      if(!abort.signal.aborted&&Number.isSafeInteger(data.timestamp)&&data.timestamp>0&&data.timestamp<=Date.now()/1000)setRecord({fid,timestamp:data.timestamp});
    }).catch(()=>{/* An unknown joined date stays omitted. */});
    return()=>abort.abort();
  },[fid,revision]);
  if(record?.fid!==fid)return null;
  const date=new Date(record.timestamp*1000),label=date.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
  const full=date.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  return <div className="profile-joined"><CalendarDays size={14} aria-hidden="true"/><time dateTime={date.toISOString()} title={`First recorded fname acquisition: ${full} (UTC). This may differ from FID registration.`}>Joined {label}</time></div>;
}
