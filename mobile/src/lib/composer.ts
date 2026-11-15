import {encodeMentionText,editMentions,type DraftMention} from '../../../src/lib/mentions';
import {newCastBody,imageEmbeds} from '../../../cast.mjs';
import {linkURL,resolveLinks} from '../../../link-embeds.mjs';
import {type Cast,isFid,isHash} from './model';

export type CastRef={fid:number;hash:string};
export type Draft={text:string;mentions:DraftMention[];images:string[];links:string[];suppressed:string[];quote?:CastRef};
export type CastInput={text:string;mentions:number[];mentionsPositions:number[];images:string[];links:string[];parent?:CastRef;quote?:CastRef};
export const emptyDraft=():Draft=>({text:'',mentions:[],images:[],links:[],suppressed:[]});
export const validRef=(value:CastRef)=>isFid(value.fid)&&isHash(value.hash);
export function draftKey(fid:number,origin:string,parent?:CastRef,quote?:CastRef){return `kite.draft.v1:${encodeURIComponent(origin)}:${fid}:${parent?`${parent.fid}:${parent.hash.toLowerCase()}`:'post'}${quote?`:quote:${quote.fid}:${quote.hash.toLowerCase()}`:''}`;}
export function draftLinks(draft:Draft):{urls:string[];overflow:number}{return resolveLinks(draft.text,draft.links,draft.images,draft.suppressed,4-draft.images.length-(draft.quote?1:0));}
export function changeText(draft:Draft,text:string):Draft{return {...draft,text,mentions:editMentions(draft.text,text,draft.mentions)};}
export function addLink(draft:Draft,value:string):Draft{
  const url=linkURL(value.trim()),current=draftLinks(draft);
  if(current.urls.includes(url)||draft.images.includes(url))return draft;
  if(current.urls.length+draft.images.length+(draft.quote?1:0)>=4)throw new Error('Remove an embed to attach another link.');
  return {...draft,links:[...draft.links,url],suppressed:draft.suppressed.filter(value=>value!==url)};
}
export function removeLink(draft:Draft,url:string):Draft{return {...draft,links:draft.links.filter(value=>value!==url),suppressed:[...new Set([...draft.suppressed,url])].slice(-50)};}
export function addImage(draft:Draft,url:string):Draft{
  imageEmbeds([url],false,4);if(draft.images.includes(url))return draft;
  if(draft.images.length+draftLinks(draft).urls.length+(draft.quote?1:0)>=4)throw new Error('Remove an embed to attach another image.');
  return {...draft,images:[...draft.images,url]};
}
export function castInput(draft:Draft,parent?:CastRef):CastInput{
  if(parent&&!validRef(parent))throw new Error('Invalid reply target.');
  if(draft.quote&&!validRef(draft.quote))throw new Error('Invalid quote target.');
  const input={...encodeMentionText(draft.text,draft.mentions),images:draft.images,links:draftLinks(draft).urls,...(parent?{parent}:{}),...(draft.quote?{quote:draft.quote}:{})};
  newCastBody(input);return input;
}
export function usage(draft:Draft,maxBytes:number){
  let bytes=0,error='';const links=draftLinks(draft);
  const embeds=draft.images.length+links.urls.length+(draft.quote?1:0);
  try{bytes=new TextEncoder().encode(encodeMentionText(draft.text,draft.mentions).text).length;if(bytes>maxBytes)error=`Text exceeds the ${maxBytes.toLocaleString()} byte limit.`;else if(embeds>4)error='Attach up to four embeds.';else castInput(draft);}catch(cause){error=cause instanceof Error?cause.message:'Check your cast.';}
  return {bytes,error,embeds,hasContent:!!(draft.text.trim()||draft.mentions.length||embeds)};
}
export function restoreDraft(raw:string|null):Draft{
  if(!raw||raw.length>100000)return emptyDraft();
  try{
    const saved=JSON.parse(raw);if(typeof saved.text!=='string')return emptyDraft();
    const draft:Draft={text:saved.text.slice(0,20000),mentions:Array.isArray(saved.mentions)?saved.mentions.slice(0,10):[],images:[],links:[],suppressed:[]};
    try{encodeMentionText(draft.text,draft.mentions);}catch{draft.mentions=[];}
    if(saved.quote&&validRef(saved.quote))draft.quote={fid:saved.quote.fid,hash:saved.quote.hash};
    for(const value of (Array.isArray(saved.images)?saved.images:[]).slice(0,4))try{imageEmbeds([value],false,4);draft.images.push(value);}catch{}
    for(const value of (Array.isArray(saved.links)?saved.links:[]).slice(0,4))try{draft.links.push(linkURL(value));}catch{}
    draft.suppressed=(Array.isArray(saved.suppressed)?saved.suppressed:[]).filter((value:unknown)=>typeof value==='string'&&value.length<=256).slice(-50);
    return draft;
  }catch{return emptyDraft();}
}
export function makeDraftStore(storage:{getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;removeItem:(key:string)=>Promise<void>},key:string,initial:Draft=emptyDraft()){
  let tail:Promise<unknown>=Promise.resolve(),cleared=false;
  return {
    load:async()=>{const raw=await storage.getItem(key);return raw===null?(cleared?emptyDraft():initial):restoreDraft(raw);},
    save:(draft:Draft)=>{if(cleared)return Promise.resolve();const serialized=JSON.stringify(draft);const result=tail.catch(()=>{}).then(()=>storage.setItem(key,serialized));tail=result;return result;},
    clear:()=>{cleared=true;const result=tail.catch(()=>{}).then(()=>storage.removeItem(key));tail=result;return result;},
  };
}
export function publishedCast(fid:number,key:string,hash:string,timestamp:number,input:CastInput):Cast{
  const body=newCastBody(input);
  return {hash,signer:key,data:{fid,timestamp,castAddBody:body}};
}
export const MAX_IMAGE_BYTES=10*1024*1024;
export function imageMime(bytes:Uint8Array):string{
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  const prefix=String.fromCharCode(...bytes.slice(0,12));if(prefix.startsWith('GIF87a')||prefix.startsWith('GIF89a'))return 'image/gif';
  if(prefix.startsWith('RIFF')&&prefix.slice(8)==='WEBP')return 'image/webp';
  throw new Error('Choose a JPEG, PNG, GIF or WebP image.');
}
