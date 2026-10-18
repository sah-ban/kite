import { hub, HubError, type Cast, type Config } from './hub';

export type Page<T> = { items: T[]; next: string };
export type Reaction = { hash: string; data: { fid: number; timestamp: number; type: string | number; reactionBody: { type: string | number; targetCastId?: {fid: number; hash: string} } } };
export type ActivityTab = 'replies' | 'likes' | 'recasts';
export type Activity = { replies?: Page<Cast>; likes?: Page<Reaction>; recasts?: Page<Reaction>; errors: Partial<Record<ActivityTab,string>> };
export const castPath = (cast: Pick<Cast,'hash'|'data'>) => `/cast/${cast.data.fid}/${cast.hash}`;
export const countLabel = (page?: Page<unknown>) => page ? `${page.items.length.toLocaleString()}${page.next ? '+' : ''}` : '—';
export function mergePage<T>(previous: Page<T>, next: Page<T>, key: (item: T) => string | number): Page<T> {
  const items = new Map(previous.items.map(item => [key(item),item]));
  for (const item of next.items) items.set(key(item),item);
  return {items:[...items.values()],next:next.next};
}
export async function readReplies(config: Config, cast: Cast, token = ''): Promise<Page<Cast>> {
  const data = await hub<{messages:Cast[];nextPageToken?:string}>(config,'castsByParent',{
    fid:cast.data.fid,hash:cast.hash,pageSize:1000,reverse:'false',...(token?{pageToken:token}:{}),
  });
  const items = data.messages.filter(c => c.data.castAddBody.parentCastId?.fid===cast.data.fid && c.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase());
  return {items:[...new Map(items.map(c=>[c.hash.toLowerCase(),c])).values()],next:data.nextPageToken||''};
}
export async function readReactions(config: Config, cast: Cast, kind: 'likes'|'recasts', token = ''): Promise<Page<Reaction>> {
  const data = await hub<{messages:Reaction[];nextPageToken?:string}>(config,'reactionsByCast',{
    target_fid:cast.data.fid,target_hash:cast.hash,reaction_type:kind==='likes'?'Like':'Recast',pageSize:1000,reverse:'true',...(token?{pageToken:token}:{}),
  });
  const items = data.messages.filter(m => {
    const d=m.data, b=d?.reactionBody;
    return (d?.type==='MESSAGE_TYPE_REACTION_ADD'||d?.type===3) && Number.isSafeInteger(d.fid) && d.fid>0
      && (b?.type===(kind==='likes'?'REACTION_TYPE_LIKE':'REACTION_TYPE_RECAST')||b?.type===(kind==='likes'?1:2))
      && b.targetCastId?.fid===cast.data.fid && b.targetCastId.hash.toLowerCase()===cast.hash.toLowerCase();
  });
  return {items:[...new Map(items.map(m=>[m.data.fid,m])).values()],next:data.nextPageToken||''};
}

// Limit concurrent count requests while multiple cards enter the viewport.
let active = 0;
const waiting: (()=>void)[] = [];
async function queued<T>(fn:()=>Promise<T>): Promise<T> {
  if(active>=3) await new Promise<void>(resolve=>waiting.push(resolve)); else active++;
  try { return await fn(); }
  finally { const next=waiting.shift(); if(next)next(); else active--; }
}
const activityCache = new Map<string,{expires:number;value:Promise<Activity>}>();
export function readActivity(config: Config, cast: Cast, revision: number|string = 0): Promise<Activity> {
  const key=`${config.readUrl}:${cast.data.fid}:${cast.hash.toLowerCase()}:${revision}`;
  const cached=activityCache.get(key);
  if(cached && cached.expires>Date.now()) return cached.value;
  const value=(async()=>{
    const result:Activity={errors:{}};
    await Promise.all((['replies','likes','recasts'] as const).map(async tab=>{
      try {
        const page=await queued<Page<Cast>|Page<Reaction>>(()=>tab==='replies'?readReplies(config,cast):readReactions(config,cast,tab));
        if(tab==='replies')result.replies=page as Page<Cast>; else result[tab]=page as Page<Reaction>;
      } catch(e) { result.errors[tab]=(e as Error).message; }
    }));
    return result;
  })();
  activityCache.set(key,{expires:Date.now()+30_000,value});
  if(activityCache.size>200)activityCache.delete(activityCache.keys().next().value!);
  return value;
}
type Link = {data:{fid:number;type:string|number;linkBody?:{type:string;targetFid:number}}};
export async function followsAccount(config:Config, sourceFid:number, targetFid:number, signal?:AbortSignal):Promise<boolean> {
  if (!Number.isSafeInteger(sourceFid)||sourceFid<=0||!Number.isSafeInteger(targetFid)||targetFid<=0||sourceFid===targetFid) return false;
  try {
    const link=await hub<Link>(config,'linkById',{fid:sourceFid,target_fid:targetFid,link_type:'follow'},signal);
    return (link.data?.type==='MESSAGE_TYPE_LINK_ADD'||link.data?.type===5)&&link.data.fid===sourceFid&&link.data.linkBody?.type==='follow'&&link.data.linkBody.targetFid===targetFid;
  } catch (error) {
    if (error instanceof HubError&&error.status===404) return false;
    throw error;
  }
}
export async function readConnections(config:Config,fid:number,kind:'followers'|'following',token=''):Promise<Page<number>> {
  const data=await hub<{messages:Link[];nextPageToken?:string}>(config,kind==='followers'?'linksByTargetFid':'linksByFid',{
    ...(kind==='followers'?{target_fid:fid}:{fid}),link_type:'follow',pageSize:1000,...(token?{pageToken:token}:{}),
  });
  const items=data.messages.filter(m=>(m.data?.type==='MESSAGE_TYPE_LINK_ADD'||m.data?.type===5)&&m.data.linkBody?.type==='follow')
    .map(m=>kind==='followers'?m.data.fid:m.data.linkBody!.targetFid).filter(n=>Number.isSafeInteger(n)&&n>0);
  return {items:[...new Set(items)],next:data.nextPageToken||''};
}
