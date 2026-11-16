import {type CastRef,type Draft,draftKey,restoreDraft,hasDraftContent,validRef} from './composer';

export type DraftLocation={parent?:CastRef;quote?:CastRef;editHash?:string};
export type SavedDraft=DraftLocation&{key:string;draft:Draft;updatedAt:number};

export function parseDraftKey(key:string,fid:number,origin:string):DraftLocation|undefined{
  const prefix=draftKey(fid,origin).slice(0,-4);
  if(!key.startsWith(prefix))return;
  const match=/^(?:post|([1-9]\d*):(0x[\da-f]{40}))(?::quote:([1-9]\d*):(0x[\da-f]{40}))?(?::draft:[\w-]{1,80}|:edit:(0x[\da-f]{40}))?$/i.exec(key.slice(prefix.length));
  if(!match)return;
  const parent=match[1]?{fid:Number(match[1]),hash:match[2]}:undefined;
  const quote=match[3]?{fid:Number(match[3]),hash:match[4]}:undefined;
  if(parent&&!validRef(parent)||quote&&!validRef(quote))return;
  return {...(parent?{parent}:{}),...(quote?{quote}:{}),...(match[5]?{editHash:match[5]}:{})};
}

export function resolveDraftRouteKey(value:unknown,fid:number,origin:string):{key:string;location:DraftLocation}|undefined{
  if(typeof value!=='string')return;
  const prefix=draftKey(fid,origin).slice(0,-4),decodedPrefix=decodeURIComponent(prefix);
  // Router search params decode the percent escapes already stored in the server portion.
  // Rebuild only the expected account/server prefix so storage keeps its canonical key.
  const key=value.startsWith(prefix)?value:value.startsWith(decodedPrefix)?prefix+value.slice(decodedPrefix.length):undefined;
  if(!key)return;
  const location=parseDraftKey(key,fid,origin);
  return location?{key,location}:undefined;
}

export async function listSavedDrafts(storage:{getAllKeys:()=>Promise<readonly string[]>;multiGet:(keys:string[])=>Promise<readonly (readonly [string,string|null])[]>},fid:number,origin:string):Promise<SavedDraft[]>{
  const keys=(await storage.getAllKeys()).filter(key=>!!parseDraftKey(key,fid,origin));
  if(!keys.length)return [];
  const entries=await storage.multiGet(keys);
  return entries.flatMap(([key,raw])=>{
    const location=parseDraftKey(key,fid,origin),draft=restoreDraft(raw);
    if(!location||!hasDraftContent(draft))return [];
    let updatedAt=0;
    try{const value=JSON.parse(raw||'null')?.updatedAt;if(typeof value==='number'&&Number.isFinite(value)&&value>0)updatedAt=value;}catch{}
    return [{key,draft,updatedAt,...location}];
  }).sort((a,b)=>b.updatedAt-a.updatedAt||a.key.localeCompare(b.key));
}
