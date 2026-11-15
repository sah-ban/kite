import {castTextParts,encodeMentionText} from '../../../src/lib/mentions';
import {type Cast,castKey,isCast} from './model';
import {type Draft,type CastInput,emptyDraft} from './composer';
import type {Api} from './api';
import type {AccountSession,PreparedCast} from './account-core';

export type EditAttempt={source:Cast;prepared:PreparedCast;deleted:boolean;accepted:boolean};
export type EditStorage={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>};
export const editKey=(origin:string,fid:number,hash:string)=>`kite.edit.v1:${encodeURIComponent(origin)}:${fid}:${hash.toLowerCase()}`;
export function restoreEditDraft(cast:Cast,labels:Record<number,string>={}):Draft{
  const body=cast.data.castAddBody,draft=emptyDraft();
  for(const part of castTextParts(body.text,body.mentions,body.mentionsPositions).parts){
    if(part.fid===undefined)draft.text+=part.text;
    else{const label=`@${labels[part.fid]||`fid${part.fid}`}`,start=draft.text.length;draft.text+=label;draft.mentions.push({start,end:draft.text.length,fid:part.fid,label});}
  }
  const encoded=encodeMentionText(draft.text,draft.mentions);
  if(encoded.text!==body.text||JSON.stringify(encoded.mentions)!==JSON.stringify(body.mentions||[])||JSON.stringify(encoded.mentionsPositions)!==JSON.stringify(body.mentionsPositions||[]))throw new Error('This cast has invalid mention positions and cannot be safely prefilled.');
  draft.originalEmbeds=[...(body.embeds||[]).map(embed=>embed.castId?{castId:{...embed.castId}}:{url:embed.url}),...(body.embedsDeprecated||[]).map(url=>({url}))];
  if(body.parentUrl)draft.parentUrl=body.parentUrl;
  return draft;
}
export async function readEditDraft(cast:Cast,api:Pick<Api,'profile'>){
  const labels=await Promise.all([...new Set(cast.data.castAddBody.mentions||[])].map(async fid=>{try{return [fid,(await api.profile(fid)).username] as const;}catch{return [fid,''] as const;}}));
  return restoreEditDraft(cast,Object.fromEntries(labels));
}
export async function readEditAttempt(storage:EditStorage,key:string,session:AccountSession,hash:string):Promise<EditAttempt|undefined>{
  const raw=await storage.getItem(key);if(raw===null)return;
  try{
    if(raw.length>200000)throw Error();const value=JSON.parse(raw) as EditAttempt;
    if(!isCast(value.source)||value.source.data.fid!==session.fid||value.source.hash.toLowerCase()!==hash.toLowerCase()||!isCast(value.prepared?.cast)||value.prepared.cast.data.fid!==session.fid||value.prepared.cast.signer!==session.key||typeof value.prepared.bytes!=='string'||typeof value.deleted!=='boolean'||typeof value.accepted!=='boolean'||value.accepted&&!value.deleted)throw Error();
    return value;
  }catch{throw new Error('Could not restore this edit with the connected signer. Reconnect the signer that started it.');}
}
export async function runCastEdit(options:{source:Cast;input:CastInput;session:AccountSession;origin:string;storage:EditStorage;prepare:(source:Cast,input:CastInput)=>Promise<PreparedCast>;validate:(prepared:PreparedCast)=>Promise<Cast>;remove:(source:Cast)=>Promise<void>;submit:(prepared:PreparedCast)=>Promise<Cast>;onDeleted:()=>void;onProgress:(message:string)=>void;onPrepared:()=>void}){
  const {source,input,session,origin,storage,prepare,validate,remove,submit,onDeleted,onProgress,onPrepared}=options;
  if(source.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
  const key=editKey(origin,session.fid,source.hash);
  let attempt=await readEditAttempt(storage,key,session,source.hash);
  if(!attempt){onProgress('Preparing replacement…');attempt={source,prepared:await prepare(source,input),deleted:false,accepted:false};}
  // Validate the saved signed bytes before deleting anything, including on retries.
  attempt.prepared.cast=await validate(attempt.prepared);
  if(attempt.prepared.cast.data.timestamp<=source.data.timestamp)throw new Error('The replacement must be newer than the previous cast.');
  if(castKey(attempt.source)!==castKey(source))throw new Error('This edit belongs to another cast.');
  await storage.setItem(key,JSON.stringify(attempt));onPrepared();
  if(attempt.accepted){onDeleted();return attempt.prepared.cast;}
  if(!attempt.deleted){
    onProgress('Deleting previous cast…');await remove(source);attempt.deleted=true;onDeleted();
    await storage.setItem(key,JSON.stringify(attempt));
  }else onDeleted();
  onProgress('Publishing replacement…');
  try{
    const cast=await submit(attempt.prepared);attempt.accepted=true;
    // A successful node response is authoritative even if the final local save fails.
    await storage.setItem(key,JSON.stringify(attempt)).catch(()=>{});return cast;
  }catch{throw new Error('The previous cast was deleted, but replacement publication is not confirmed. Your signed draft is saved; retry to submit the same cast.');}
}
