import { ID_REGISTRY_ADDRESS, idRegistryABI, makeUserNameProofClaim, ViemLocalEip712Signer } from '@farcaster/core';
import { bytesToHex, createPublicClient, getAddress, http, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { hub, invalidateProfile, localOrigin, type Config } from './hub';
import { canEditProfile } from './profile-edit';
import type { Session } from './signing';
// @ts-expect-error Shared registry policy and proof validation.
import { claimableFname, fnameName, FNAME_COOLDOWN, ownsFnameProof } from '../../fname-utils.mjs';
export { claimableFname };

const registry='https://fnames.farcaster.xyz';
export type FnameTransfer={id:number;name:string;from:number;to:number;owner:Hex;timestamp:number};
export type FnameCheck={fid:number;name:string;currentName:string|null;available:boolean;alreadyOwned:boolean;readyAt:number;checkedAt:number};
export type FnameStage='ready'|'release-submitted'|'released'|'claim-submitted'|'claimed'|'complete';
export type PreparedFnameChange={review:FnameCheck&{owner:Hex};readonly stage:FnameStage;run:(progress:(message:string)=>void,signal?:AbortSignal)=>Promise<string>;discard:()=>void};
type Dependencies={custody?:(fid:number)=>Promise<Hex>;pause?:(signal?:AbortSignal)=>Promise<void>;selectPreferred?:(name:string)=>Promise<unknown>};
function requireLocal(){if(!localOrigin())throw new Error('Open Freecast on localhost to change an fname.');}
const bounded=(signal?:AbortSignal)=>AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20_000)]);
function transfer(value:unknown):FnameTransfer {
  const data=value as Record<string,unknown>|null;
  if(!data||![data.id,data.timestamp].every(n=>Number.isSafeInteger(n)&&Number(n)>0)||![data.from,data.to].every(n=>Number.isSafeInteger(n)&&Number(n)>=0)||typeof data.owner!=='string')throw new Error('Invalid fname registry response.');
  return {id:Number(data.id),name:fnameName(data.username??data.name),from:Number(data.from),to:Number(data.to),owner:getAddress(data.owner),timestamp:Number(data.timestamp)};
}
async function read(path:string,signal?:AbortSignal,missing=false):Promise<any> {
  const response=await fetch(registry+path,{signal:bounded(signal),redirect:'error',cache:'no-store'});
  if(missing&&response.status===404)return null;
  if(!response.ok)throw new Error('Could not read the fname registry. Retry before changing your name.');
  return response.json();
}
async function current(fid:number,signal?:AbortSignal):Promise<FnameTransfer|null> {
  const data=await read(`/transfers/current?fid=${fid}`,signal,true);if(data===null)return null;
  const entry=transfer(data.transfer);if(entry.to!==fid)throw new Error('Registry returned a different FID.');return entry;
}
async function history(name:string,signal?:AbortSignal):Promise<FnameTransfer|null> {
  const deadline=bounded(signal);let cursor=0,latest:FnameTransfer|null=null;
  for(let page=0;page<100;page++){
    const data=await read(`/transfers?${new URLSearchParams({name,...(cursor?{from_id:String(cursor)}:{})})}`,deadline);
    if(!Array.isArray(data.transfers))throw new Error('Invalid fname transfer history.');if(!data.transfers.length)return latest;
    let next=cursor;
    for(const raw of data.transfers){const item=transfer(raw);if(item.name!==name)throw new Error('Registry returned a different fname.');next=Math.max(next,item.id);if(!latest||item.timestamp>latest.timestamp||item.timestamp===latest.timestamp&&item.id>latest.id)latest=item;}
    if(next<=cursor)throw new Error('Fname history pagination did not advance.');cursor=next;
  }
  throw new Error('Could not finish checking fname history.');
}
async function registryTime(signal?:AbortSignal):Promise<number> {
  const data=await read('/current-time',signal);if(!Number.isSafeInteger(data.currentTime)||data.currentTime<=0)throw new Error('Could not check the registry clock.');return data.currentTime;
}
export async function inspectFnameChange(fid:number,value:string,signal?:AbortSignal):Promise<FnameCheck> {
  requireLocal();if(!Number.isSafeInteger(fid)||fid<=0)throw new Error('Invalid account FID.');
  const name=claimableFname(value) as string,deadline=bounded(signal);
  const [owned,target,checkedAt]=await Promise.all([current(fid,deadline),history(name,deadline),registryTime(deadline)]);
  const alreadyOwned=owned?.name===name&&target?.to===fid,available=alreadyOwned||!target||target.to===0;
  const readyAt=alreadyOwned?0:Math.max(owned?owned.timestamp+FNAME_COOLDOWN:0,target?.to===0?target.timestamp+FNAME_COOLDOWN:0);
  return {fid,name,currentName:owned?.name||null,available,alreadyOwned,readyAt,checkedAt};
}
export function fnameCheckError(check:FnameCheck):string {
  if(!check.available)return `@${check.name} is already taken.`;
  if(check.readyAt>check.checkedAt)return `The 28-day cooldown ends ${new Date(check.readyAt*1000).toLocaleString()}.`;
  return '';
}
const pause=(signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  signal?.throwIfAborted();const done=()=>{signal?.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,1500),cancel=()=>{clearTimeout(timer);reject(signal?.reason);};signal?.addEventListener('abort',cancel,{once:true});
});
async function sendTransfer(payload:{name:string;from:number;to:number;fid:number;owner:Hex;timestamp:number;signature:Hex},signal?:AbortSignal) {
  requireLocal();signal?.throwIfAborted();
  const response=await fetch(registry+'/transfers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:bounded(signal),redirect:'error',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const errors:Record<string,string>={THROTTLED:'The registry cooldown has not ended.',USERNAME_TAKEN:'The new fname is no longer available.',USERNAME_RESERVED:'The new fname is reserved.',TOO_MANY_NAMES:'This FID already owns an fname.',INVALID_FID_OWNER:'The custody address no longer owns this FID.',INVALID_SIGNATURE:'The registry rejected the custody signature.',INVALID_TIMESTAMP:'The registry rejected the signature timestamp. Retry to create a fresh proof.'};
    throw new Error(errors[data.code]||`The fname registry rejected the transfer (${response.status}).`);
  }
  const result=transfer(data.transfer);if(result.name!==payload.name||result.from!==payload.from||result.to!==payload.to)throw new Error('Transfer submitted, but its result is unconfirmed. Retry to check registry state.');
}
export async function prepareFnameChange(config:Config,session:Session,value:string,phrase:string,index:number,signal?:AbortSignal,dependencies:Dependencies={}):Promise<PreparedFnameChange> {
  requireLocal();if(!Number.isSafeInteger(index)||index<0||index>100)throw new Error('Address derivation index must be between 0 and 100.');
  if(!config.validatorUrl)throw new Error('Publishing must be configured to update your preferred username.');
  const check=await inspectFnameChange(session.fid,value,signal),problem=fnameCheckError(check);if(problem)throw new Error(problem);
  if(!await canEditProfile(config,session,signal))throw new Error('Connect a signer with profile editing permission before changing your fname.');
  let account:ReturnType<typeof mnemonicToAccount>|undefined;
  try{account=mnemonicToAccount(phrase.trim().toLowerCase().replace(/\s+/g,' '),{addressIndex:index});}catch{throw new Error('Invalid custody recovery phrase.');}
  const owner=account.address,custody=dependencies.custody||((fid:number)=>createPublicClient({chain:optimism,transport:http(config.optimismRpcUrl)}).readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'custodyOf',args:[BigInt(fid)]}));
  if(getAddress(await custody(session.fid))!==getAddress(owner)){account=undefined;throw new Error('This phrase and derivation index do not control the connected FID’s custody address.');}
  signal?.throwIfAborted();
  let stage:FnameStage=check.alreadyOwned?'claimed':'ready',working=false,releaseTimestamp=0,preferredSubmitted=false;
  const wait=dependencies.pause||pause;
  return {review:{...check,owner},get stage(){return stage;},discard(){account=undefined;},async run(progress,runSignal){
    requireLocal();if(stage==='complete')return check.name;if(!account)throw new Error('Enter the custody phrase again to resume this change.');if(working)throw new Error('A username change is already in progress.');working=true;
    try{
      runSignal?.throwIfAborted();progress('Rechecking ownership, availability and cooldown…');
      if(getAddress(await custody(session.fid))!==getAddress(owner))throw new Error('The custody owner changed. Prepare the change again.');
      if(!await canEditProfile(config,session,runSignal))throw new Error('The connected signer can no longer edit your profile.');
      const fresh=await inspectFnameChange(session.fid,check.name,runSignal);
      if(fresh.currentName&&fresh.currentName!==check.currentName&&fresh.currentName!==check.name)throw new Error('Your current fname changed. Start again to review the new state.');
      if(fresh.alreadyOwned)stage='claimed';
      else{
        const problem=fnameCheckError(fresh);if(problem)throw new Error(problem);
        if(!account)throw new Error('This change was cancelled.');
        const signer=new ViemLocalEip712Signer(account),timestamp=Math.max(fresh.checkedAt,releaseTimestamp+1);
        const sign=async(name:string,time:number)=>{const signature=await signer.signUserNameProofClaim(makeUserNameProofClaim({name,owner,timestamp:time}));if(signature.isErr())throw new Error('Could not sign the fname proof.');return bytesToHex(signature.value);};
        const release=fresh.currentName?{name:fresh.currentName,from:session.fid,to:0,fid:session.fid,owner,timestamp,signature:await sign(fresh.currentName,timestamp)}:undefined;
        const claimTime=release?timestamp+1:timestamp,claim={name:check.name,from:0,to:session.fid,fid:session.fid,owner,timestamp:claimTime,signature:await sign(check.name,claimTime)};
        // Both custody proofs exist before the first irreversible registry write.
        if(release){stage='release-submitted';releaseTimestamp=timestamp;progress(`Releasing @${release.name}…`);await sendTransfer(release,runSignal);}
        const afterRelease=await current(session.fid,runSignal);
        if(afterRelease&&afterRelease.name!==check.name)throw new Error('Release is not confirmed by the registry. Retry before claiming.');
        if(afterRelease?.name===check.name)stage='claimed';
        else{stage='released';progress(`Claiming @${check.name}…`);stage='claim-submitted';await sendTransfer(claim,runSignal);const claimed=await current(session.fid,runSignal);if(claimed?.name!==check.name)throw new Error('The claim was submitted but is not confirmed. Retry to check it.');stage='claimed';}
      }
      progress('Waiting for the new fname proof on your read node…');let proofReady=false;const proofSignal=bounded(runSignal);
      for(let i=0;i<12;i++){
        runSignal?.throwIfAborted();if(proofSignal.aborted)break;try{proofReady=ownsFnameProof(await hub(config,'userNameProofByName',{name:check.name},proofSignal),check.name,session.fid);}catch{runSignal?.throwIfAborted();if(proofSignal.aborted)break;}
        if(proofReady)break;if(i<11)await wait(runSignal);
      }
      if(!proofReady)throw new Error('The new fname is claimed, but your read node has not confirmed its proof yet. Retry to finish your profile update.');
      progress('Updating preferred username…');const profileSignal=bounded(runSignal);
      for(let i=0;i<12;i++){
        runSignal?.throwIfAborted();if(profileSignal.aborted)break;const data=await hub<{messages:{data:{userDataBody?:{type:number|string;value:string}}}[]}>(config,'userDataByFid',{fid:session.fid},profileSignal);
        if(data.messages.some(message=>{const field=message.data.userDataBody;return (field?.type===6||field?.type==='USER_DATA_TYPE_USERNAME')&&field.value===check.name;})){stage='complete';account=undefined;return check.name;}
        if(!preferredSubmitted){const {setPreferredFname}=await import('./signing');await (dependencies.selectPreferred?dependencies.selectPreferred(check.name):setPreferredFname(config,session,check.name));preferredSubmitted=true;}
        if(i<11)await wait(runSignal);
      }
      throw new Error('Preferred username submitted, but your read node has not confirmed it yet. Retry to check it.');
    }catch(error){
      const context=stage==='claimed'?'Your new fname is claimed. ':stage==='released'||stage==='claim-submitted'?(check.currentName?'Your previous fname was released. ':'The claim may be unconfirmed. '):stage==='release-submitted'?'Release was submitted; its state may be unconfirmed. ':'';
      throw new Error(context+(error as Error).message);
    }finally{working=false;invalidateProfile(session.fid);}
  }};
}
