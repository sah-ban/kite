import {type Cast, type Profile, type Page, isCast, isFid, isHash, mergeCasts} from './model';

type Fetcher = typeof fetch;
type NodePage = {messages?: unknown[]; nextPageToken?: string};
const FIFTEEN_SECONDS = 15000;
export function createApi(server: string, fetcher: Fetcher = fetch) {
  const profiles = new Map<number, Promise<Profile>>();
  async function request<T>(path: string, params: Record<string,string|number> = {}, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(cancel, FIFTEEN_SECONDS);
    try {
      const query = new URLSearchParams(Object.entries(params).map(([key,value]) => [key,String(value)]));
      const response = await fetcher(`${server}${path}${query.size ? `?${query}` : ''}`, {signal:controller.signal, redirect:'error', credentials:'omit'});
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404 || (response.status === 400 && typeof body?.error_detail === 'string' && /^status:\s*NotFound\b/.test(body.error_detail))) throw new Error('This item is unavailable or has been removed.');
        throw new Error('Kite couldn’t load this right now. Please try again.');
      }
      if (!body || typeof body !== 'object') throw new Error('Kite couldn’t load this right now. Please try again.');
      return body as T;
    } catch(error) {
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) throw new Error('The request timed out. Check your connection and try again.');
      if (error instanceof TypeError) throw new Error('Could not connect to Kite. Check your internet connection.');
      throw error;
    } finally {clearTimeout(timeout); signal?.removeEventListener('abort',cancel);}
  }
  function hub<T>(endpoint:string, params:Record<string,string|number>, signal?:AbortSignal) {
    return request<T>('/api/read/v1/' + endpoint, params, signal);
  }
  const page = (value:NodePage): Page<Cast> => {
    if (!Array.isArray(value.messages)) throw new Error('Could not load casts. Please try again.');
    return {items:mergeCasts([],value.messages.filter(isCast)),next:typeof value.nextPageToken==='string'?value.nextPageToken:''};
  };
  async function profile(fid:number):Promise<Profile> {
    if (!isFid(fid)) throw new Error('Invalid profile FID.');
    const cached = profiles.get(fid); if (cached) return cached;
    const pending = hub<NodePage>('userDataByFid',{fid}).then(value => {
      if (!Array.isArray(value.messages)) throw new Error('Profile data is unavailable.');
      const fields = new Map<string|number,string>();
      for (const item of value.messages) {
        const body = (item as {data?:{userDataBody?:{type:string|number;value:string}}})?.data?.userDataBody;
        if (body && typeof body.value === 'string') fields.set(body.type,body.value);
      }
      const field = (type:string,id:number) => fields.get(`USER_DATA_TYPE_${type}`)||fields.get(id)||'';
      return {fid,name:field('DISPLAY',2)||field('USERNAME',6)||`FID ${fid}`,username:field('USERNAME',6),avatar:field('PFP',1),bio:field('BIO',3),banner:field('BANNER',10),website:field('URL',5)};
    }).catch(error=>{profiles.delete(fid);throw error;});
    profiles.set(fid,pending);
    if (profiles.size > 250) profiles.delete(profiles.keys().next().value!);
    return pending;
  }
  async function resolveProfile(value:string,signal?:AbortSignal):Promise<number> {
    if (/^\d+$/.test(value) && isFid(Number(value))) return Number(value);
    const result = await hub<{fid:number}>('userNameProofByName',{name:value.replace(/^@/,'')},signal);
    if (!isFid(result.fid)) throw new Error('No profile was found. Try the account’s FID.');
    return result.fid;
  }
  async function resolveCast(author:string, hash:string, signal?:AbortSignal):Promise<Cast> {
    const fid = await resolveProfile(author,signal);
    if (isHash(hash)) {
      const result = await hub<Cast>('castById',{fid,hash},signal);
      if (!isCast(result) || result.data.fid !== fid || result.hash.toLowerCase() !== hash.toLowerCase()) throw new Error('Could not find the requested cast.');
      return result;
    }
    if (!/^0x[0-9a-f]{8,40}$/i.test(hash)) throw new Error('Invalid cast hash.');
    let cursor = '';
    // Bound lookups; older casts can always be opened using their full hash.
    for (let index=0;index<10;index++) {
      const result = page(await hub<NodePage>('castsByFid',{fid,pageSize:100,reverse:'true',...(cursor?{pageToken:cursor}:{})},signal));
      const found = result.items.filter(cast=>cast.hash.toLowerCase().startsWith(hash.toLowerCase()));
      if (found.length===1) return found[0];
      if (found.length>1) throw new Error('This short hash is ambiguous. Use the full cast link.');
      if (!result.next || cursor===result.next) break;
      cursor=result.next;
    }
    throw new Error('Could not find this short hash. Paste the full Kite cast link.');
  }
  return {
    request,profile,resolveProfile,resolveCast,
    config: (signal?:AbortSignal)=>request<{indexedFeedEnabled:boolean}>('/api/config',{},signal),
    status: (signal?:AbortSignal)=>request<{available:boolean;syncDelaySeconds:number|null}>('/api/node/status',{},signal),
    publicFeed:async(cursor='',signal?:AbortSignal)=>page(await request<NodePage>('/api/feed/public',{order:'newest',...(cursor?{cursor}:{})},signal)),
    profileCasts:async(fid:number,cursor='',signal?:AbortSignal)=>page(await hub<NodePage>('castsByFid',{fid,pageSize:30,reverse:'true',...(cursor?{pageToken:cursor}:{})},signal)),
    replies:async(cast:Cast,cursor='',signal?:AbortSignal)=>{
      const result=page(await hub<NodePage>('castsByParent',{fid:cast.data.fid,hash:cast.hash,pageSize:30,reverse:'false',...(cursor?{pageToken:cursor}:{})},signal));
      return {...result,items:result.items.filter(reply=>reply.data.castAddBody.parentCastId?.fid===cast.data.fid&&reply.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase())};
    },
    reactions:async(cast:Cast,kind:'likes'|'recasts',cursor='',signal?:AbortSignal):Promise<Page<number>>=>{
      const value=await hub<NodePage>('reactionsByCast',{target_fid:cast.data.fid,target_hash:cast.hash,reaction_type:kind==='likes'?'Like':'Recast',pageSize:100,reverse:'true',...(cursor?{pageToken:cursor}:{})},signal);
      if(!Array.isArray(value.messages))throw new Error('Reaction details are unavailable.');
      const fids=value.messages.flatMap(item=>{
        const data=(item as {data?:{fid:number;type:string|number;reactionBody?:{type:string|number;targetCastId?:{fid:number;hash:string}}}})?.data;
        const target=data?.reactionBody?.targetCastId;
        return data&&isFid(data.fid)&&(data.type===3||data.type==='MESSAGE_TYPE_REACTION_ADD')&&[kind==='likes'?1:2,kind==='likes'?'REACTION_TYPE_LIKE':'REACTION_TYPE_RECAST'].includes(data.reactionBody?.type??'')&&target?.fid===cast.data.fid&&target.hash?.toLowerCase()===cast.hash.toLowerCase()?[data.fid]:[];
      });
      return {items:[...new Set(fids)],next:typeof value.nextPageToken==='string'?value.nextPageToken:''};
    },
    counts:(fid:number,signal?:AbortSignal)=>request<{followerCount?:number;followingCount?:number;followers?:number;following?:number}>('/api/profile/counts',{fid},signal),
    embed:(url:string,signal?:AbortSignal)=>request<{kind:'image'|'video'|'link';url:string;title?:string;description?:string;image?:string;poster?:string}>('/api/embed',{url},signal),
  };
}
export type Api = ReturnType<typeof createApi>;
