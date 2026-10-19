import { castTextParts, encodeMentionText, type DraftMention } from './mentions';
import { profile, hub, HubError, type Cast, type Config } from './hub';
import type { Session } from './signing';
import { getProStatus } from './pro';
// @ts-expect-error Shared validation for browser and server signing.
import { replacementBody } from '../../replacement.mjs';
export type DraftEmbed={url?:string;castId?:{fid:number;hash:string}};
export type EditCastDraft={text:string;mentions:DraftMention[];embeds:DraftEmbed[];parentCastId?:{fid:number;hash:string};parentUrl?:string};
export type ReplacementAttempt={hash:string;bytes:Uint8Array;originalDeleted:boolean;deletionSubmitted:boolean;publicationStarted:boolean};
export function restoreCastDraft(cast:Cast,labels:Record<number,string>={}):EditCastDraft {
  const body=cast.data.castAddBody;let text='';const mentions:DraftMention[]=[];
  for(const part of castTextParts(body.text,body.mentions,body.mentionsPositions).parts){
    if(part.fid!==undefined){const label=`@${labels[part.fid]||`fid${part.fid}`}`,start=text.length;text+=label;mentions.push({start,end:text.length,fid:part.fid,label});}else text+=part.text;
  }
  const restored=encodeMentionText(text,mentions);
  if(restored.text!==body.text||JSON.stringify(restored.mentions)!==JSON.stringify(body.mentions)||JSON.stringify(restored.mentionsPositions)!==JSON.stringify(body.mentionsPositions))throw new Error('This cast has invalid mention positions and cannot be safely prefilled.');
  return {text,mentions,embeds:[...(body.embeds||[]).map(embed=>embed.castId?{castId:{...embed.castId}}:{url:embed.url}),...(body.embedsDeprecated||[]).map(url=>({url}))],...(body.parentCastId?{parentCastId:{...body.parentCastId}}:{}),...(body.parentUrl?{parentUrl:body.parentUrl}:{})};
}
export async function readCastDraft(config:Config,cast:Cast):Promise<EditCastDraft> {
  const labels:Record<number,string>={};
  await Promise.all([...new Set(cast.data.castAddBody.mentions)].map(async fid=>{try{const person=await profile(config,fid);if(person.username)labels[fid]=person.username;}catch{/* Preserve the FID with a visible fallback token. */}}));
  return restoreCastDraft(cast,labels);
}
export function encodedEditDraft(draft:EditCastDraft){return replacementBody({...encodeMentionText(draft.text,draft.mentions),embeds:draft.embeds,...(draft.parentCastId?{parentCastId:draft.parentCastId}:{}),...(draft.parentUrl!==undefined?{parentUrl:draft.parentUrl}:{})});}
export async function prepareReplacement(config:Config,session:Session,cast:Cast,draft:EditCastDraft):Promise<ReplacementAttempt> {
  if(cast.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
  if(!config.validatorUrl)throw new Error('Publishing is not configured.');
  const body=encodedEditDraft(draft);
  if((body.type===2||body.embeds.length>2)&&!await getProStatus(config,session.fid))throw new Error('This replacement needs active Farcaster Pro for more than two embeds or text over 1,024 bytes.');
  const {prepareCastReplacement}=await import('./signing');
  const prepared=await prepareCastReplacement(config,session,cast,body);
  return {...prepared,originalDeleted:false,deletionSubmitted:false,publicationStarted:false};
}
const absent=(error:unknown)=>error instanceof HubError&&(error.notFound||error.status===410);
export async function publishReplacement(config:Config,session:Session,source:Cast,attempt:ReplacementAttempt,onProgress:(message:string)=>void=()=>{},onDeleted:()=>void=()=>{}):Promise<string> {
  if(source.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
  const {deleteCast}=await import('./signing');
  if(!attempt.originalDeleted){
    let exists=true;try{await hub(config,'castById',{fid:session.fid,hash:source.hash});}catch(error){if(absent(error))exists=false;else throw error;}
    if(exists||!attempt.deletionSubmitted){onProgress('Deleting previous cast…');await deleteCast(config,session,source,()=>{attempt.deletionSubmitted=true;});}
    attempt.originalDeleted=true;onDeleted();
  }
  try{await hub(config,'castById',{fid:session.fid,hash:attempt.hash});return attempt.hash;}catch(error){if(!absent(error))throw error;}
  onProgress('Publishing replacement…');attempt.publicationStarted=true;
  const response=await fetch('/api/write/v1/submitMessage',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(attempt.bytes),signal:AbortSignal.timeout(25_000)});
  if(!response.ok){try{await hub(config,'castById',{fid:session.fid,hash:attempt.hash});return attempt.hash;}catch{/* Keep the same signed replacement for a safe retry. */}throw new Error(`Original cast deleted. Replacement submission failed (${response.status}). Your draft is kept; retry to publish it.`);}
  onProgress('Confirming replacement…');
  for(let i=0;i<12;i++){
    try{await hub(config,'castById',{fid:session.fid,hash:attempt.hash});return attempt.hash;}catch(error){if(!absent(error))throw error;}
    if(i<11)await new Promise(resolve=>setTimeout(resolve,2500));
  }
  throw new Error(`Original cast deleted. Replacement inclusion is not confirmed yet (${attempt.hash}). Your draft is kept; retry to check or resubmit the same cast.`);
}
