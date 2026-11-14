import {type Cast, type Profile, type Page, isCast, isFid, isHash, mergeCasts} from './model';
import {MAX_IMAGE_BYTES,imageMime} from './composer';
import {imageEmbeds} from '../../../cast.mjs';
import {proSubscriptionExpiry} from '../../../pro-subscription.mjs';

type Fetcher = typeof fetch;
type NodePage = {messages?: unknown[]; nextPageToken?: string};
const FIFTEEN_SECONDS = 15000;
export class ApiError extends Error {
  constructor(public status:number,message:string,public notFound=false){super(message);}
}
export function createApi(server: string, fetcher: Fetcher = fetch) {
  const profiles = new Map<number, Promise<Profile>>();
  const published=new Map<string,{cast:Cast;expires:number}>();
  const activityCache = new Map<string,{expires:number;value:Promise<{likes:Page<number>|null;recasts:Page<number>|null}>}>();
  let activeActivity = 0;
  const activityQueue:(()=>void)[]=[];
  async function queuedActivity<T>(load:()=>Promise<T>):Promise<T>{
    if(activeActivity>=3)await new Promise<void>(resolve=>activityQueue.push(resolve));else activeActivity++;
    try{return await load();}finally{const next=activityQueue.shift();if(next)next();else activeActivity--;}
  }
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
        if (response.status === 404 || (response.status === 400 && typeof body?.error_detail === 'string' && /^status:\s*NotFound\b/.test(body.error_detail))) throw new ApiError(response.status,'This item is unavailable or has been removed.',true);
        throw new ApiError(response.status,'Kite couldn’t load this right now. Please try again.');
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
      const cached=published.get(`${fid}:${hash.toLowerCase()}`);if(cached&&cached.expires>Date.now())return cached.cast;
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
  async function reactions(cast:Cast,kind:'likes'|'recasts',cursor='',signal?:AbortSignal):Promise<Page<number>>{
      const value=await hub<NodePage>('reactionsByCast',{target_fid:cast.data.fid,target_hash:cast.hash,reaction_type:kind==='likes'?'Like':'Recast',pageSize:100,reverse:'true',...(cursor?{pageToken:cursor}:{})},signal);
      if(!Array.isArray(value.messages))throw new Error('Reaction details are unavailable.');
      const fids=value.messages.flatMap(item=>{
        const data=(item as {data?:{fid:number;type:string|number;reactionBody?:{type:string|number;targetCastId?:{fid:number;hash:string}}}})?.data;
        const target=data?.reactionBody?.targetCastId;
        return data&&isFid(data.fid)&&(data.type===3||data.type==='MESSAGE_TYPE_REACTION_ADD')&&[kind==='likes'?1:2,kind==='likes'?'REACTION_TYPE_LIKE':'REACTION_TYPE_RECAST'].includes(data.reactionBody?.type??'')&&target?.fid===cast.data.fid&&target.hash?.toLowerCase()===cast.hash.toLowerCase()?[data.fid]:[];
      });
      return {items:[...new Set(fids)],next:typeof value.nextPageToken==='string'?value.nextPageToken:''};
  }
  function activity(cast:Cast){
    const key=`${cast.data.fid}:${cast.hash.toLowerCase()}`;
    const saved=activityCache.get(key);if(saved&&saved.expires>Date.now())return saved.value;
    const entry={expires:Infinity,value:Promise.resolve<{likes:Page<number>|null;recasts:Page<number>|null}>({likes:null,recasts:null})};
    entry.value=Promise.allSettled([queuedActivity(()=>reactions(cast,'likes')),queuedActivity(()=>reactions(cast,'recasts'))]).then(([likes,recasts])=>{
      entry.expires=Date.now()+(likes.status==='fulfilled'&&recasts.status==='fulfilled'?30000:3000);
      return {likes:likes.status==='fulfilled'?likes.value:null,recasts:recasts.status==='fulfilled'?recasts.value:null};
    });
    activityCache.set(key,entry);if(activityCache.size>200)activityCache.delete(activityCache.keys().next().value!);
    return entry.value;
  }
  async function accountPost<T>(path:'approval'|'verify',body:unknown):Promise<T>{
    const response=await fetcher(`${server}/api/mobile/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new ApiError(response.status,typeof value?.error==='string'?value.error:'Could not connect your account. Please try again.');
    if(!value||typeof value!=='object')throw new Error('Could not connect your account. Please try again.');
    return value;
  }
  return {
    origin:server,request,profile,resolveProfile,resolveCast,reactions,activity,accountPost,
    rememberCast:(cast:Cast)=>{if(!isCast(cast))throw new Error('Invalid published cast.');published.set(`${cast.data.fid}:${cast.hash.toLowerCase()}`,{cast,expires:Date.now()+120000});if(published.size>100)published.delete(published.keys().next().value!);},
    proExpiry:async(fid:number,signal?:AbortSignal)=>proSubscriptionExpiry(await hub('storageLimitsByFid',{fid},signal)),
    proStatus:async(fid:number)=>proSubscriptionExpiry(await hub('storageLimitsByFid',{fid}))>Date.now()/1000,
    uploadImage:async(bytes:Uint8Array,signal?:AbortSignal)=>{
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES)throw new Error('Images must be 10 MB or smaller.');
      const type=imageMime(bytes);
      const response=await fetcher(`${server}/api/images/upload`,{method:'POST',headers:{'Content-Type':type,Origin:server},body:Uint8Array.from(bytes).buffer,credentials:'omit',redirect:'error',signal:signal||AbortSignal.timeout(65000)});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(response.status===429?'Too many image uploads. Please try again later.':response.status===413?'Images must be 10 MB or smaller.':'Could not upload this image. Please try again.');
      return imageEmbeds([result?.url],false,4)[0].url as string;
    },
    gifs:async(query='',cursor='',signal?:AbortSignal)=>{
      const value=await request<{items:{id:string;url:string;preview:string;title:string}[];next?:string}>('/api/gifs',{q:query,...(cursor?{pos:cursor}:{})},signal);
      if(!Array.isArray(value.items))throw new Error('Could not load GIFs.');
      const items=value.items.filter(item=>{try{return typeof item.id==='string'&&typeof item.title==='string'&&!!imageEmbeds([item.url],false,4)&&!!imageEmbeds([item.preview],false,4);}catch{return false;}});
      return {items,next:typeof value.next==='string'&&value.next!==cursor?value.next:''};
    },
    approvalStatus:async(token:string)=>{
      const response=await fetcher('https://api.farcaster.xyz/v2/signed-key-request?'+new URLSearchParams({token}),{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Could not check Farcaster approval. Please try again.');
      const value=(await response.json())?.result?.signedKeyRequest;
      if(typeof value?.state!=='string')throw new Error('Could not check Farcaster approval. Please try again.');
      return {state:value.state as string,userFid:value.userFid as unknown};
    },
    submit:async(bytes:Uint8Array)=>{
      const response=await fetcher(`${server}/api/write/v1/submitMessage`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:Uint8Array.from(bytes).buffer,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new ApiError(response.status,'Couldn’t submit this message. Check your connection and account access, then try again.');
      // A successful submission is final; do not poll the read node afterward.
    },
    hasReaction:async(fid:number,cast:Cast,kind:'likes'|'recasts')=>queuedActivity(async()=>{
      try{
        const value=await hub<{data?:{fid:number;type:number|string;reactionBody?:{type:number|string;targetCastId?:{fid:number;hash:string}}}}>('reactionById',{fid,target_fid:cast.data.fid,target_hash:cast.hash,reaction_type:kind==='likes'?'Like':'Recast'});
        const data=value.data,target=data?.reactionBody?.targetCastId;
        if(data?.fid!==fid||![3,'MESSAGE_TYPE_REACTION_ADD'].includes(data.type)||![kind==='likes'?1:2,kind==='likes'?'REACTION_TYPE_LIKE':'REACTION_TYPE_RECAST'].includes(data.reactionBody?.type??'')||target?.fid!==cast.data.fid||target.hash?.toLowerCase()!==cast.hash.toLowerCase())throw new Error('Could not check your reaction. Please try again.');
        return true;
      }catch(error){if(error instanceof ApiError&&error.notFound)return false;throw error;}
    }),
    config: (signal?:AbortSignal)=>request<{indexedFeedEnabled:boolean}>('/api/config',{},signal),
    status: (signal?:AbortSignal)=>request<{available:boolean;syncDelaySeconds:number|null}>('/api/node/status',{},signal),
    publicFeed:async(cursor='',signal?:AbortSignal)=>page(await request<NodePage>('/api/feed/public',{order:'newest',...(cursor?{cursor}:{})},signal)),
    profileCasts:async(fid:number,cursor='',signal?:AbortSignal)=>page(await hub<NodePage>('castsByFid',{fid,pageSize:30,reverse:'true',...(cursor?{pageToken:cursor}:{})},signal)),
    replies:async(cast:Cast,cursor='',signal?:AbortSignal)=>{
      const result=page(await hub<NodePage>('castsByParent',{fid:cast.data.fid,hash:cast.hash,pageSize:30,reverse:'false',...(cursor?{pageToken:cursor}:{})},signal));
      return {...result,items:result.items.filter(reply=>reply.data.castAddBody.parentCastId?.fid===cast.data.fid&&reply.data.castAddBody.parentCastId.hash.toLowerCase()===cast.hash.toLowerCase())};
    },
    counts:(fid:number,signal?:AbortSignal)=>request<{followerCount?:number;followingCount?:number;followers?:number;following?:number}>('/api/profile/counts',{fid},signal),
    embed:(url:string,signal?:AbortSignal)=>request<{kind:'image'|'video'|'link';url:string;title?:string;description?:string;image?:string;poster?:string}>('/api/embed',{url},signal),
  };
}
export type Api = ReturnType<typeof createApi>;
