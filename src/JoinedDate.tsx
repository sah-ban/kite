import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
type Username={username:string;timestamp:number};
export function JoinedDate({fid,revision=0,currentUsername}:{fid:number;revision?:number;currentUsername?:string}) {
  const [record,setRecord]=useState<{fid:number;timestamp:number|null;usernames:Username[]}>();
  useEffect(()=>{
    const abort=new AbortController();setRecord(undefined);
    fetch(`/api/profile/joined?${new URLSearchParams({fid:String(fid)})}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15_000)])}).then(async response=>{
      if(!response.ok)throw new Error('Unavailable');const data=await response.json();
      if(abort.signal.aborted)return;
      const timestamp=Number.isSafeInteger(data.timestamp)&&data.timestamp>0&&data.timestamp<=Date.now()/1000?data.timestamp:null;
      const usernames:Username[]=Array.isArray(data.usernames)?data.usernames.filter((item:Username)=>typeof item?.username==='string'&&/^[a-z0-9][a-z0-9-]{0,15}$/.test(item.username)&&Number.isSafeInteger(item.timestamp)&&item.timestamp>0&&item.timestamp<=Date.now()/1000):[];
      setRecord({fid,timestamp,usernames});
    }).catch(()=>{/* An unknown joined date stays omitted. */});
    return()=>abort.abort();
  },[fid,revision]);
  if(record?.fid!==fid)return null;
  const date=record.timestamp?new Date(record.timestamp*1000):undefined;
  const previous=currentUsername===undefined?[]:record.usernames.filter(item=>item.username!==currentUsername.replace(/^@/,'').toLowerCase()).filter((item,index,all)=>all.findIndex(other=>other.username===item.username)===index);
  return <>
    {date&&<div className="profile-joined"><CalendarDays size={14} aria-hidden="true"/><time dateTime={date.toISOString()}>Joined {date.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</time></div>}
    {previous.length>0&&<details className="profile-username-history"><summary>Previous usernames ({previous.length})</summary><ul>{previous.map(item=><li key={item.username}>@{item.username}</li>)}</ul></details>}
  </>;
}
