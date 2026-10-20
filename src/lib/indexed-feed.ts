import type { Cast } from './hub';
import type { Filters } from './feed-filters';
export type FeedStatus={historyDays:number;following:number;imported:number;failed:number;initializing:boolean;followsSyncedAt:string|null;workerOnline:boolean;connectedShards:number[];checkpoints:{shard:number;lastEventAt:string}[]};
export type FeedPage={messages:Cast[];nextPageToken:string;status:FeedStatus};
export async function indexedFollowing(fid:number,filters:Filters,order:'newest'|'oldest',cursor='',signal?:AbortSignal):Promise<FeedPage>{
  const params=new URLSearchParams({fid:String(fid),mode:filters.mode,clients:filters.clientFids.split(/[\s,]+/).filter(Boolean).join(','),keys:filters.signerKeys.split(/[\s,]+/).filter(Boolean).join(','),self:String(filters.selfRegistered),order,...(cursor?{cursor}:{})});
  const response=await fetch('/api/feed/following?'+params,{signal:signal||AbortSignal.timeout(20000)});
  if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error?.error||'Could not load the Following feed.');}
  return response.json();
}
