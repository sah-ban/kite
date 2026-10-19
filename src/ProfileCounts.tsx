import { useEffect, useState } from 'react';
import type { Config } from './lib/hub';
import { countLabel, readConnections } from './lib/social';
type Kind='followers'|'following';
export function ProfileCounts({config,fid,revision,onConnections}:{config:Config;fid:number;revision:number;onConnections:(kind:Kind)=>void}) {
  const [record,setRecord]=useState<{fid:number;labels:Partial<Record<Kind,string>>;errors:Partial<Record<Kind,string>>}>();
  useEffect(()=>{
    const abort=new AbortController();setRecord(undefined);
    (async()=>{
      try{
        const response=await fetch(`/api/profile/counts?${new URLSearchParams({fid:String(fid)})}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15_000)])});
        if(!response.ok)throw new Error('Counts unavailable');const data=await response.json();
        if(data.fid!==fid||![data.followerCount,data.followingCount].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error('Invalid counts');
        if(!abort.signal.aborted)setRecord({fid,labels:{followers:data.followerCount.toLocaleString(),following:data.followingCount.toLocaleString()},errors:{}});
      }catch{
        if(abort.signal.aborted)return;
        await Promise.all((['followers','following'] as const).map(async kind=>{
          try{const page=await readConnections(config,fid,kind);if(!abort.signal.aborted)setRecord(value=>({fid,labels:{...value?.labels,[kind]:countLabel(page)},errors:value?.errors||{}}));}
          catch{if(!abort.signal.aborted)setRecord(value=>({fid,labels:value?.labels||{},errors:{...value?.errors,[kind]:'Count unavailable. Open list to retry.'}}));}
        }));
      }
    })();
    return()=>abort.abort();
  },[config,fid,revision]);
  return <>{(['following','followers'] as const).map(kind=><button key={kind} title={record?.fid===fid?record.errors[kind]:undefined} onClick={()=>onConnections(kind)}><strong>{record?.fid===fid?record.labels[kind]||'—':'—'}</strong> {kind[0].toUpperCase()+kind.slice(1)}</button>)}</>;
}
