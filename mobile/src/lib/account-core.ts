import {ed25519} from '@noble/curves/ed25519';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils';
// Public ownership claim shared with the Node gateway.
import {pushClaim,validPushRegistration} from '../../../push-proof.mjs';
import {mobileClaim} from '../../../mobile-proof.mjs';
import type {Api} from './api';
import {type Cast,isFid,isHash} from './model';
import {castSdk} from './cast-sdk';
import {type CastInput,castBody,publishedCast} from './composer';
import {profileChanges,profileFields,type ProfileChanges} from './profile-edit';

export type PreparedCast={bytes:string;cast:Cast};
export type AccountSession={fid:number;key:string;address:string};
export type PendingAccount={deepLinkUrl:string;appFid:number;expiresAt:number};
export type PushRegistration={installationId:string;token:string;enabled:boolean};
export type AccountSnapshot={session:AccountSession|null;pending:PendingAccount|null;hasSavedKey:boolean;pushEnabled?:boolean};
export type AccountStorage={get:()=>Promise<string|null>;set:(value:string)=>Promise<void>;remove:()=>Promise<void>};
type Stored={version:1;server:string;privateKey:string;key:string;phase:'preparing'|'pending'|'active';fid?:number;address?:string;token?:string;deepLinkUrl?:string;appFid?:number;expiresAt?:number;push?:PushRegistration;pushConfirmed?:boolean};
const keyPattern=/^0x[a-f0-9]{64}$/;
function validApprovalLink(value:unknown):value is string{
  if(typeof value!=='string')return false;
  try{const url=new URL(value);return !url.username&&!url.password&&(['farcaster:','warpcast:'].includes(url.protocol)||url.protocol==='https:'&&['farcaster.xyz','www.farcaster.xyz','warpcast.com','www.warpcast.com'].includes(url.hostname));}catch{return false;}
}
export function createAccount(api:Pick<Api,'origin'|'accountPost'|'approvalStatus'|'submit'>,storage:AccountStorage,random:(size:number)=>Promise<Uint8Array>,now=Date.now){
  let saved:Stored|null=null,restored=false,tail:Promise<unknown>=Promise.resolve();
  const lastProfileWrites=new Map<string,number>();
  function mutationTimestamp(key:string,now:number){const value=Math.max(now,(lastProfileWrites.get(key)||0)+1);if(value>now+300)throw new Error('Please wait a moment before trying again.');return value;}
  function exclusive<T>(run:()=>Promise<T>):Promise<T>{const value=tail.then(run);tail=value.catch(()=>{});return value;}
  function snapshot():AccountSnapshot{return {session:saved?.phase==='active'?{fid:saved.fid!,key:saved.key,address:saved.address!}:null,pending:saved?.phase==='pending'?{deepLinkUrl:saved.deepLinkUrl!,appFid:saved.appFid!,expiresAt:saved.expiresAt!}:null,hasSavedKey:!!saved||!restored,...(saved?.push?{pushEnabled:!!saved.push.enabled&&!!saved.pushConfirmed}:{})};}
  async function persist(value:Stored){await storage.set(JSON.stringify(value));saved=value;}
  async function proof(record:Stored,purpose:'approve'|'verify'|'feed',fid=0){
    const issuedAt=Math.floor(now()/1000),nonce=bytesToHex(await random(16));
    const secret=hexToBytes(record.privateKey.slice(2));
    try{return {key:record.key,issuedAt,nonce,signature:'0x'+bytesToHex(ed25519.sign(mobileClaim(api.origin,purpose,record.key,issuedAt,nonce,fid),secret)),...(purpose!=='approve'?{fid}:{})};}
    finally{secret.fill(0);}
  }
  async function sendPush(record:Stored,registration:PushRegistration){
    const issuedAt=Math.floor(now()/1000),nonce=bytesToHex(await random(16)),secret=hexToBytes(record.privateKey.slice(2));
    try{
      const signature='0x'+bytesToHex(ed25519.sign(pushClaim(api.origin,record.key,issuedAt,nonce,record.fid!,registration),secret));
      const result=await api.accountPost<{registered:boolean;fid:number}>('push',{key:record.key,issuedAt,nonce,fid:record.fid,signature,registration});
      if(result.fid!==record.fid||result.registered!==registration.enabled)throw new Error('Could not update push notifications. Please try again.');
    }finally{secret.fill(0);}
  }
  async function prepareCast(input:CastInput,minimumTimestamp?:number):Promise<PreparedCast>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      const record=saved,body=castBody(input);
      const sdk=await castSdk(),secret=hexToBytes(record.privateKey.slice(2));
      const now=sdk.getFarcasterTime()._unsafeUnwrap();
      if(minimumTimestamp!==undefined&&(!Number.isSafeInteger(minimumTimestamp)||minimumTimestamp<1||minimumTimestamp>now+301)){secret.fill(0);throw new Error('Invalid original cast timestamp.');}
      const reference=(value:{fid:number;hash:string})=>({...value,hash:hexToBytes(value.hash.slice(2))});
      try{
        const result=await sdk.makeCastAdd({...body,embeds:body.embeds.map((embed:{url?:string;castId?:{fid:number;hash:string}})=>embed.castId?{castId:reference(embed.castId)}:{url:embed.url!}),embedsDeprecated:[],...(body.parentCastId?{parentCastId:reference(body.parentCastId)}:{})},{fid:record.fid!,network:sdk.FarcasterNetwork.MAINNET,...(minimumTimestamp!==undefined?{timestamp:Math.max(now,minimumTimestamp)}:{})},new sdk.NobleEd25519Signer(secret));
        if(result.isErr())throw new Error(result.error.message);
        const message=result.value;if(!message.data)throw new Error('Could not prepare this cast.');
        const dataBytes=sdk.MessageData.encode(message.data).finish();
        return {bytes:'0x'+bytesToHex(sdk.Message.encode({...message,dataBytes,data:undefined}).finish()),cast:publishedCast(record.fid!,record.key,'0x'+bytesToHex(message.hash),message.data.timestamp,input)};
      }finally{secret.fill(0);}
  }
  async function validatePrepared(prepared:PreparedCast):Promise<Cast>{
    if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
    if(typeof prepared.bytes!=='string'||prepared.bytes.length>100000||!/^0x(?:[0-9a-f]{2})+$/i.test(prepared.bytes))throw new Error('Invalid saved replacement.');
    const sdk=await castSdk(),message=sdk.Message.decode(hexToBytes(prepared.bytes.slice(2)));
    const data=message.dataBytes?.length?sdk.MessageData.decode(message.dataBytes):message.data;
    if(!data?.castAddBody||data.type!==sdk.MessageType.CAST_ADD||data.network!==sdk.FarcasterNetwork.MAINNET||data.fid!==saved.fid||'0x'+bytesToHex(message.signer)!==saved.key||'0x'+bytesToHex(message.hash)!==prepared.cast.hash||!(await sdk.validations.validateMessage({...message,data})).isOk())throw new Error('This saved replacement does not match the connected account.');
    const body=data.castAddBody,reference=(value:{fid:number;hash:Uint8Array})=>({fid:value.fid,hash:'0x'+bytesToHex(value.hash)});
    return {hash:'0x'+bytesToHex(message.hash),signer:saved.key,data:{fid:data.fid,timestamp:data.timestamp,castAddBody:{text:body.text,mentions:body.mentions,mentionsPositions:body.mentionsPositions,embeds:body.embeds.map(embed=>embed.castId?{castId:reference(embed.castId)}:{url:embed.url}),...(body.parentCastId?{parentCastId:reference(body.parentCastId)}:{}),...(body.parentUrl?{parentUrl:body.parentUrl}:{})}}};
  }
  return {
    snapshot,
    restore:()=>exclusive(async()=>{
      restored=false;saved=null;
      const raw=await storage.get();if(!raw){saved=null;restored=true;return snapshot();}
      let record:Stored;
      try{
        record=JSON.parse(raw);
        if(record.version!==1||record.server!==api.origin||!keyPattern.test(record.privateKey)||!keyPattern.test(record.key)||!['preparing','pending','active'].includes(record.phase))throw Error();
        const secret=hexToBytes(record.privateKey.slice(2));try{if('0x'+bytesToHex(ed25519.getPublicKey(secret))!==record.key)throw Error();}finally{secret.fill(0);}
        if(record.push&&!validPushRegistration(record.push))throw Error();
        if(record.phase==='active'&&(!isFid(record.fid)||!/^0x[a-f0-9]{40}$/i.test(record.address||'')))throw Error();
        if(record.phase==='pending'&&(!validApprovalLink(record.deepLinkUrl)||typeof record.token!=='string'||!record.token||record.token.length>500||!isFid(record.appFid)||!Number.isSafeInteger(record.expiresAt)))throw Error();
      }catch{throw new Error('Could not unlock your saved account. Sign out to reset this connection.');}
      saved=record;restored=true;return snapshot();
    }),
    begin:()=>exclusive(async()=>{
      if(!restored)throw new Error('Could not unlock your saved account. Sign out to reset this connection.');
      if(saved?.phase==='active'||saved?.phase==='pending')return snapshot();
      if(!saved){const secret=await random(32);try{await persist({version:1,server:api.origin,privateKey:'0x'+bytesToHex(secret),key:'0x'+bytesToHex(ed25519.getPublicKey(secret)),phase:'preparing'});}finally{secret.fill(0);}}
      const record=saved!;
      const result=await api.accountPost<{key:string;token:string;deepLinkUrl:string;appFid:number;expiresAt:number}>('approval',await proof(record,'approve'));
      if(result.key!==record.key||typeof result.token!=='string'||!result.token||result.token.length>500||!validApprovalLink(result.deepLinkUrl)||!isFid(result.appFid)||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=now())throw new Error('Farcaster returned an invalid approval. Please try again.');
      await persist({...record,phase:'pending',token:result.token,deepLinkUrl:result.deepLinkUrl,appFid:result.appFid,expiresAt:result.expiresAt});return snapshot();
    }),
    check:()=>exclusive(async()=>{
      if(saved?.phase==='active')return snapshot();
      if(saved?.phase!=='pending')throw new Error('Start a Farcaster sign-in first.');
      const record=saved;
      const result=await api.approvalStatus(record.token!);
      if(['expired','cancelled','failed'].includes(result.state))throw new Error('This approval expired or was cancelled. Start again.');
      if(!['completed','approved'].includes(result.state))return snapshot();
      if(!isFid(result.userFid))throw new Error('Farcaster did not return an approved account.');
      const verified=await api.accountPost<{state:'active'|'pending';fid?:number;key?:string;address?:string}>('verify',await proof(record,'verify',result.userFid));
      if(verified.state==='pending')return snapshot();
      if(verified.state!=='active'||verified.fid!==result.userFid||verified.key!==record.key||!/^0x[a-f0-9]{40}$/i.test(verified.address||''))throw new Error('Could not confirm your account connection.');
      await persist({version:1,server:record.server,privateKey:record.privateKey,key:record.key,phase:'active',fid:verified.fid,address:verified.address});return snapshot();
    }),
    enrollNotifications:()=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      const result=await api.accountPost<{enrolled:boolean;fid:number}>('feed',await proof(saved,'feed',saved.fid!));
      if(!result.enrolled||result.fid!==saved.fid)throw new Error('Could not prepare your notifications. Please try again.');
    }),
    getPush:()=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      return saved.push;
    }),
    setPush:(registration:PushRegistration)=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      if(!validPushRegistration(registration))throw new Error('Invalid push registration.');
      // Persist before enabling remotely so even a failed response can be disabled at sign-out.
      if(registration.enabled)await persist({...saved,push:registration,pushConfirmed:false});
      await sendPush(saved,registration);
      await persist({...saved,push:registration,pushConfirmed:true});return snapshot();
    }),
    signOut:()=>exclusive(async()=>{
      if(saved?.phase==='active'&&saved.push?.enabled)await sendPush(saved,{...saved.push,enabled:false});
      await storage.remove();saved=null;restored=true;return snapshot();}),
    cast:(input:CastInput)=>exclusive(async()=>{const prepared=await prepareCast(input);await api.submit(hexToBytes(prepared.bytes.slice(2)));return prepared.cast;}),
    follow:(targetFid:number,remove:boolean)=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      if(!isFid(targetFid)||targetFid===saved.fid||typeof remove!=='boolean')throw new Error('Invalid follow target.');
      const sdk=await castSdk(),secret=hexToBytes(saved.privateKey.slice(2));
      try{
        const key=`${saved.fid}:follow:${targetFid}`,timestamp=mutationTimestamp(key,sdk.getFarcasterTime()._unsafeUnwrap());
        const result=await(remove?sdk.makeLinkRemove:sdk.makeLinkAdd)({type:'follow',targetFid},{fid:saved.fid!,network:sdk.FarcasterNetwork.MAINNET,timestamp},new sdk.NobleEd25519Signer(secret));
        if(result.isErr())throw new Error(result.error.message);
        await api.submit(sdk.Message.encode(result.value).finish());
        lastProfileWrites.set(key,timestamp);
      }finally{secret.fill(0);}
    }),
    updateProfile:(changes:ProfileChanges,onSaved:(changes:ProfileChanges)=>void=()=>{})=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      const fields=profileChanges(changes),sdk=await castSdk(),secret=hexToBytes(saved.privateKey.slice(2));
      try{
        // Validate and sign every field before submitting any profile changes.
        const messages=[];
        for(const [field,value] of fields){
          const key=`${saved.fid}:profile:${field}`,timestamp=mutationTimestamp(key,sdk.getFarcasterTime()._unsafeUnwrap());
          const result=await sdk.makeUserDataAdd({type:profileFields[field].type,value},{fid:saved.fid!,network:sdk.FarcasterNetwork.MAINNET,timestamp},new sdk.NobleEd25519Signer(secret));
          if(result.isErr())throw new Error(result.error.message);
          messages.push({field,value,key,timestamp,bytes:sdk.Message.encode(result.value).finish()});
        }
        for(const message of messages){await api.submit(message.bytes);lastProfileWrites.set(message.key,message.timestamp);onSaved({[message.field]:message.value});}
      }finally{secret.fill(0);}
    }),
    prepareReplacement:(cast:Cast,input:CastInput)=>exclusive(async()=>{
      if(saved?.phase!=='active'||cast.data.fid!==saved.fid||!isHash(cast.hash))throw new Error('You can only edit your own casts.');
      return prepareCast(input,cast.data.timestamp+1);
    }),
    validatePreparedCast:(prepared:PreparedCast)=>exclusive(()=>validatePrepared(prepared)),
    submitPreparedCast:(prepared:PreparedCast)=>exclusive(async()=>{const cast=await validatePrepared(prepared);await api.submit(hexToBytes(prepared.bytes.slice(2)));return cast;}),
    deleteCast:(cast:Cast)=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      if(cast.data.fid!==saved.fid||!isHash(cast.hash))throw new Error('You can only delete your own casts.');
      const {FarcasterNetwork,Message,NobleEd25519Signer,makeCastRemove}=await castSdk();
      const secret=hexToBytes(saved.privateKey.slice(2));
      try{
        const result=await makeCastRemove({targetHash:hexToBytes(cast.hash.slice(2))},{fid:saved.fid!,network:FarcasterNetwork.MAINNET},new NobleEd25519Signer(secret));
        if(result.isErr())throw new Error('Could not sign this deletion. Please try again.');
        await api.submit(Message.encode(result.value).finish());
      }finally{secret.fill(0);}
    }),
    react:(cast:Cast,kind:'likes'|'recasts',remove:boolean)=>exclusive(async()=>{
      if(saved?.phase!=='active')throw new Error('Sign in to Kite first.');
      if(!isFid(cast.data.fid)||!isHash(cast.hash)||!['likes','recasts'].includes(kind)||typeof remove!=='boolean')throw new Error('Invalid reaction target.');
      const {FarcasterNetwork,Message,NobleEd25519Signer,ReactionType,makeReactionAdd,makeReactionRemove}=await castSdk();
      const secret=hexToBytes(saved.privateKey.slice(2));
      try{
        const result=await(remove?makeReactionRemove:makeReactionAdd)({type:kind==='likes'?ReactionType.LIKE:ReactionType.RECAST,targetCastId:{fid:cast.data.fid,hash:hexToBytes(cast.hash.slice(2))}},{fid:saved.fid!,network:FarcasterNetwork.MAINNET},new NobleEd25519Signer(secret));
        if(result.isErr())throw new Error('Could not sign this reaction. Please try again.');
        await api.submit(Message.encode(result.value).finish());
      }finally{secret.fill(0);}
    }),
  };
}
