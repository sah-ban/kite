import { castTextParts, encodeMentionText, type DraftMention } from './mentions';
import { profile, type Cast, type Config } from './hub';
import type { Session } from './signing';
import { getProStatus } from './pro';
// @ts-expect-error Shared validation for browser and server signing.
import { replacementBody } from '../../replacement.mjs';
export type DraftEmbed={url?:string;castId?:{fid:number;hash:string}};
export type EditCastDraft={text:string;mentions:DraftMention[];embeds:DraftEmbed[];parentCastId?:{fid:number;hash:string};parentUrl?:string};
export type ReplacementAttempt={hash:string;bytes:Uint8Array;originalDeleted:boolean;deletionSubmitted:boolean;publicationStarted:boolean;publicationAccepted?:boolean};
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
  if(!config.readUrl)throw new Error('Configure your node before publishing.');
  const body=encodedEditDraft(draft);
  if(body.type===2&&!await getProStatus(config,session.fid))throw new Error('This replacement needs active Farcaster Pro for text over 1,024 bytes.');
  const {prepareCastReplacement}=await import('./signing');
  const prepared=await prepareCastReplacement(config,session,cast,body);
  return {...prepared,originalDeleted:false,deletionSubmitted:false,publicationStarted:false};
}
export async function publishReplacement(config:Config,session:Session,source:Cast,attempt:ReplacementAttempt,onProgress:(message:string)=>void=()=>{},onDeleted:()=>void=()=>{}):Promise<string> {
  if(source.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
  if(attempt.publicationAccepted)return attempt.hash;
  const {deleteCast}=await import('./signing');
  if(!attempt.originalDeleted){
    onProgress('Deleting previous cast…');await deleteCast(config,session,source,()=>{attempt.deletionSubmitted=true;});
    attempt.originalDeleted=true;onDeleted();
  }
  onProgress('Publishing replacement…');attempt.publicationStarted=true;
  const response=await fetch('/api/write/v1/submitMessage',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(attempt.bytes),signal:AbortSignal.timeout(25_000)});
  if(!response.ok)throw new Error(`Original cast deleted. Replacement submission failed (${response.status}). Your draft is kept; retry to publish it.`);
  attempt.publicationAccepted=true;
  return attempt.hash;
}
