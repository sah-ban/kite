import { hub, invalidateProfile, type Config, type Profile } from './hub';
import { getProStatus } from './pro';
import type { Session } from './signing';
// @ts-expect-error Shared validation for browser and server signing.
import { PROFILE_FIELDS as fields, validateProfileField } from '../../profile-fields.mjs';
export type ProfileDraft={name:string;bio:string;avatar:string;banner:string;website:string};
export const PROFILE_FIELDS=fields as {key:keyof ProfileDraft;type:number;label:string;limit:number;url?:boolean}[];
export function profileDraft(person:Profile):ProfileDraft {
  return {name:person.displayName??person.name,bio:person.bio,avatar:person.avatar,banner:person.banner||'',website:person.website||''};
}
export function profileChanges(original:ProfileDraft,draft:ProfileDraft):{type:number;value:string;label:string}[] {
  return PROFILE_FIELDS.flatMap(field=>{
    validateProfileField(field.type,draft[field.key]);
    return original[field.key]!==draft[field.key]?[{type:field.type,value:draft[field.key],label:field.label}]:[];
  });
}
export async function canEditProfile(config:Config,session:Session,signal?:AbortSignal):Promise<boolean> {
  if(session.remote)return true;
  let token='';const seen=new Set<string>();
  do{
    const page=await hub<{signers:{fid:number;key:string;source:string|number;keyType:number;expiresAt?:number|string;scopes?:(number|string)[]}[];nextPageToken?:string}>(config,'signersByFid',{fid:session.fid,pageSize:100,...(token?{pageToken:token}:{})},signal);
    if(!Array.isArray(page.signers))throw new Error('Could not check profile editing permissions.');
    const signer=page.signers.find(s=>s.fid===session.fid&&s.key?.toLowerCase()===session.key.toLowerCase()&&s.keyType===1);
    if(signer){
      if(signer.source===1||signer.source==='SIGNER_SOURCE_ONCHAIN')return true;
      return (signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN')&&Number(signer.expiresAt)>Date.now()/1000&&Boolean(signer.scopes?.includes(11)||signer.scopes?.includes('MESSAGE_TYPE_USER_DATA_ADD'));
    }
    token=page.nextPageToken||'';if(token&&seen.has(token))throw new Error('Could not finish checking signer permissions.');seen.add(token);
  }while(token);
  return false;
}
export async function saveProfile(config:Config,session:Session,original:ProfileDraft,draft:ProfileDraft,onProgress:(message:string)=>void=()=>{},signal?:AbortSignal):Promise<void> {
  const changes=profileChanges(original,draft);if(!changes.length)return;
  if(!await canEditProfile(config,session,signal))throw new Error('This signer cannot edit profiles. Connect a fresh signer with profile editing permission.');
  if(changes.some(change=>change.type===10)&&!await getProStatus(config,session.fid,signal))throw new Error('Banner editing requires Farcaster Pro.');
  const {updateProfileField}=await import('./signing');let confirmed=0;
  try{
    for(const change of changes){
      signal?.throwIfAborted();onProgress(`Saving ${change.label.toLowerCase()}…`);
      await updateProfileField(config,session,change.type,change.value);
      let included=false;
      for(let attempt=0;attempt<10;attempt++){
        signal?.throwIfAborted();
        if(attempt)await new Promise<void>((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',cancel);resolve();};const timer=setTimeout(done,1500);const cancel=()=>{clearTimeout(timer);reject(signal?.reason);};signal?.addEventListener('abort',cancel,{once:true});});
        try{
          const page=await hub<{messages:{data:{userDataBody?:{type:number|string;value:string}}}[]}>(config,'userDataByFid',{fid:session.fid},signal);
          const name=({1:'USER_DATA_TYPE_PFP',2:'USER_DATA_TYPE_DISPLAY',3:'USER_DATA_TYPE_BIO',5:'USER_DATA_TYPE_URL',10:'USER_DATA_TYPE_BANNER'} as Record<number,string>)[change.type];
          included=page.messages.some(m=>{const body=m.data.userDataBody;return (body?.type===change.type||body?.type===name)&&body.value===change.value;});
          if(included)break;
        }catch{/* Read node may still be syncing. */}
      }
      if(!included)throw new Error(`${change.label} was submitted, but your read node has not confirmed it yet. Wait and check before saving again.`);
      confirmed++;
    }
  }catch(error){throw new Error(`${confirmed?`${confirmed} of ${changes.length} changes confirmed. `:''}${(error as Error).message}`);}
  finally{invalidateProfile(session.fid);}
}
