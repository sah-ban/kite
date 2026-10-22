import type { Cast } from './hub';
import type { Filters } from './feed-filters';
export type FeedStatus={queued?:boolean;followingFailed?:boolean;historyDays:number;following:number;imported:number;failed:number;initializing:boolean;followsSyncedAt:string|null;workerOnline:boolean;connectedShards:number[];checkpoints:{shard:number;lastEventAt:string}[]};
export type FeedPage={messages:Cast[];nextPageToken:string;status:FeedStatus};
async function indexedPage(endpoint:'public'|'following',fid:number|undefined,filters:Filters,order:'newest'|'oldest',cursor='',signal?:AbortSignal):Promise<FeedPage>{
  const params=new URLSearchParams({...(fid===undefined?{}:{fid:String(fid)}),mode:filters.mode,clients:filters.clientFids.split(/[\s,]+/).filter(Boolean).join(','),keys:filters.signerKeys.split(/[\s,]+/).filter(Boolean).join(','),self:String(filters.selfRegistered),order,...(cursor?{cursor}:{})});
  const response=await fetch('/api/feed/'+endpoint+'?'+params,{signal:signal||AbortSignal.timeout(20000)});
  if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error?.error||`Could not load the ${endpoint==='public'?'public':'Following'} feed.`);}
  return response.json();
}
export const indexedFollowing=(fid:number,filters:Filters,order:'newest'|'oldest',cursor='',signal?:AbortSignal)=>indexedPage('following',fid,filters,order,cursor,signal);
export const indexedPublic=(filters:Filters,order:'newest'|'oldest',cursor='',signal?:AbortSignal)=>indexedPage('public',undefined,filters,order,cursor,signal);

export async function feedEnrollment(fid:number,signal?:AbortSignal):Promise<boolean>{
  const response=await fetch('/api/feed/enrollment?'+new URLSearchParams({fid:String(fid)}),{signal:signal||AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Could not check feed enrollment.');
  return Boolean((await response.json()).enrolled);
}
export async function enrollFollowing(session:import('./signing').Session,signal?:AbortSignal):Promise<void>{
  let response:Response;
  if(session.remote){
    response=await fetch('/api/auth/feed',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:signal||AbortSignal.timeout(25000)});
  }else{
    const challengeResponse=await fetch('/api/feed/challenge?'+new URLSearchParams({fid:String(session.fid),key:session.key}),{signal:signal||AbortSignal.timeout(15000)});
    const challenge=await challengeResponse.json();if(!challengeResponse.ok)throw new Error(challenge.error||'Could not prepare feed enrollment.');
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(challenge.message)));
    const signed=await session.signer.signMessageHash(digest);if(signed.isErr())throw new Error('Could not prove app key ownership.');
    const signature='0x'+[...signed.value].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    response=await fetch('/api/feed/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:challenge.nonce,signature}),signal:signal||AbortSignal.timeout(25000)});
  }
  const body=await response.json();if(!response.ok||!body.enrolled||body.fid!==session.fid)throw new Error(body.error||'Could not enroll your Following feed.');
}
