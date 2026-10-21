// @ts-expect-error Shared cast validation for browser and server.
import { newCastBody, requiresCastPro } from '../../cast.mjs';
import { getProStatus } from './pro';
import { FarcasterNetwork, ID_REGISTRY_ADDRESS, KEY_REGISTRY_ADDRESS, Message, MessageData, NobleEd25519Signer, ReactionType, idRegistryABI, keyRegistryABI, makeCastRemove, makeReactionAdd, makeReactionRemove, makeLinkAdd, makeLinkRemove } from '@farcaster/core';
import { createPublicClient, http, bytesToHex, hexToBytes, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { hub, localOrigin, type Config, type Cast } from './hub';
import { encodeMentionText, type DraftMention } from './mentions';
import { saveAppKey, unlockAppKey, unlockRememberedAppKey, rememberedAccessCurrent, clearRememberedAppKey, type UnlockedAppKey, type RememberedAccess } from './vault';
import { buildGaslessKey, checkGaslessSigner, gaslessState, GASLESS_TTL } from './gasless';

export type LocalSession = { fid: number; address: Hex; key: Hex; signer: NobleEd25519Signer; remote?: false; remembered?: RememberedAccess };
export type RemoteSession = { fid: number; address: Hex; key: Hex; remote: true };
export type Session = LocalSession | RemoteSession;
export type PreparedKey = { fid: number; address: Hex; key: Hex; ttlSeconds: number; register: () => Promise<LocalSession>; discard: () => void };
function requireLocal() { if (!localOrigin()) throw new Error('Run Kite on localhost to import or use an account.'); }
const publicClient = (config: Config) => createPublicClient({ chain: optimism, transport: http(config.optimismRpcUrl) });
function result<T>(r: { isErr: () => boolean; error?: unknown; value?: T }): T { if (r.isErr()) throw new Error(String(r.error)); return r.value!; }

async function checkRegisteredSigner(config: Config, fid: number, key: Hex) {
  const state = await publicClient(config).readContract({
    address: KEY_REGISTRY_ADDRESS, abi: keyRegistryABI,
    functionName: 'keys', args: [BigInt(fid), key],
  });
  if (Number(state[0]) !== 1 || Number(state[1]) !== 1) {
    throw new Error('This Ed25519 key is not an active onchain signer for that FID. Check the FID and key, or register a new app key. Gasless-only signers are not supported by this import yet.');
  }
}

export async function importExistingSigner(config: Config, fid: number, privateKey: string, password: string): Promise<LocalSession> {
  requireLocal();
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Enter a positive numeric FID.');
  if (password.length < 12) throw new Error('Use a passphrase of at least 12 characters to encrypt your app key.');
  const normalized = privateKey.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Enter a 32-byte Ed25519 signer private key: 64 hexadecimal digits, optionally prefixed with 0x.');
  }
  const bytes = hexToBytes(`0x${normalized}`);
  try {
    const key = bytesToHex(result(await new NobleEd25519Signer(bytes).getSignerKey()));
    await checkRegisteredSigner(config, fid, key);
    const address = await publicClient(config).readContract({
      address: ID_REGISTRY_ADDRESS, abi: idRegistryABI,
      functionName: 'custodyOf', args: [BigInt(fid)],
    });
    if (address === '0x0000000000000000000000000000000000000000') throw new Error('This FID has no custody address.');
    const storage = await hub<{ units?: number }>(config, 'storageLimitsByFid', { fid });
    if (!(Number(storage.units) > 0)) throw new Error('This account has no active storage. Rent storage before using this signer.');
    await saveAppKey(password, bytes, { fid, address, key });
    return { fid, address, key, signer: new NobleEd25519Signer(bytes.slice()) };
  } finally {
    bytes.fill(0);
  }
}

export async function prepareKey(config: Config, phrase: string, password: string, accountIndex: number): Promise<PreparedKey> {
  requireLocal();
  if (password.length < 12) throw new Error('Use a passphrase of at least 12 characters to encrypt your app key.');
  if (!config.readUrl) throw new Error('Configure your node before registering a gasless app key.');
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex > 100) throw new Error('Account index must be between 0 and 100.');
  const account = mnemonicToAccount(phrase.trim().toLowerCase().replace(/\s+/g,' '), { addressIndex: accountIndex });
  const address = account.address;
  const fid = Number(await publicClient(config).readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[address]}));
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error(`No FID is owned by ${address}. Check the custody phrase and derivation index.`);
  const storage = await hub<{ units?: number }>(config,'storageLimitsByFid',{fid});
  if (!(Number(storage.units) > 0)) throw new Error('This account has no active storage. Rent storage before registering an app key.');
  const state = await gaslessState(config,fid);
  if (!Number.isSafeInteger(state.gaslessSignerCount) || !Number.isSafeInteger(state.gaslessSignerLimit) || state.gaslessSignerLimit<=0) throw new Error('This node does not report its gasless signer capacity.');
  if (state.gaslessSignerCount >= state.gaslessSignerLimit) throw new Error('This account has reached its gasless signer limit. Revoke an unused gasless key first.');
  if (state.currentUserNonce >= 0xffffffff) throw new Error('This account has exhausted its gasless authorization nonce.');
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  try {
    const {message,key,deadline} = await buildGaslessKey(account,fid,privateKey,state.currentUserNonce+1);
    let used=false,registering=false;
    return {fid,address,key,ttlSeconds:GASLESS_TTL,discard:()=>{used=true;privateKey.fill(0);},register:async()=>{
      requireLocal();
      if (used) throw new Error('Prepare a fresh registration.');
      if (registering) throw new Error('Registration is already in progress.');
      if (Date.now()/1000 >= deadline+1609459200) throw new Error('This authorization expired. Prepare a fresh registration.');
      registering=true;
      try {
        // Persist before submission, so an interrupted request is recoverable.
        await saveAppKey(password,privateKey,{fid,address,key,registration:'gasless'});
        if (used) throw new Error('Registration was cancelled. Prepare a fresh registration.');
        if (!(await checkGaslessSigner(config,fid,key))) await submit(config,message);
        if (used) throw new Error('Registration was cancelled.');
        const session={fid,address,key,signer:new NobleEd25519Signer(privateKey.slice())};
        used=true;privateKey.fill(0);return session;
      }finally{registering=false;}
    }};
  }catch(error){privateKey.fill(0);throw error;}
}
export async function unlockSession(config: Config, password: string): Promise<LocalSession> {
  requireLocal();
  const saved = await unlockAppKey(password);
  return validatedLocalSession(config,saved);
}
async function validatedLocalSession(config: Config, saved: UnlockedAppKey): Promise<LocalSession> {
  try {
    const signer = new NobleEd25519Signer(saved.privateKey.slice());
    if (bytesToHex(result(await signer.getSignerKey())).toLowerCase() !== saved.key.toLowerCase()) throw new Error('Saved key does not match its public key.');
    if (saved.registration === 'gasless') {
      if (!(await checkGaslessSigner(config,saved.fid,saved.key))) throw new Error('This gasless app key is missing, expired, revoked, or lacks the required permissions. Wait for registration to sync or register a replacement.');
    } else await checkRegisteredSigner(config, saved.fid, saved.key);
    const storage=await hub<{units?:number}>(config,'storageLimitsByFid',{fid:saved.fid});
    if (!(Number(storage.units)>0)) throw new Error('This account has no active storage.');
    return {fid:saved.fid,address:saved.address,key:saved.key,signer};
  }finally{saved.privateKey.fill(0);}
}
export async function restoreRememberedSession(config: Config): Promise<LocalSession | null> {
  requireLocal();
  const saved=await unlockRememberedAppKey();
  if(!saved)return null;
  try{
    // Restoring is read-only and checks the same registration and storage as unlock.
    const session=await validatedLocalSession(config,saved);
    return rememberedAccessCurrent(saved.remembered)?{...session,remembered:saved.remembered}:null;
  }catch(error){
    if(!rememberedAccessCurrent(saved.remembered))return null;
    await clearRememberedAppKey().catch(()=>{});
    throw error;
  }
}
export function encodeForSnapchain(message: Message): Uint8Array {
  if (!message.dataBytes?.length) {
    if (!message.data) throw new Error('Missing message data.');
    message = {...message,dataBytes:MessageData.encode(message.data).finish()};
  }
  return Message.encode({...message,data:undefined}).finish();
}
export async function submit(config: Config, message: Message): Promise<string> {
  requireLocal();
  if (!config.readUrl) throw new Error('Configure your node before posting.');
  const bytes = encodeForSnapchain(message);
  const response = await fetch('/api/write/v1/submitMessage',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(bytes),signal:AbortSignal.timeout(25_000)});
  if (!response.ok) throw new Error(`Node returned ${response.status}: ${(await response.text()).slice(0,350)}`);
  return bytesToHex(message.hash);
}
export async function postCast(config: Config, session: Session, text: string, parent?: Cast, quote?: Cast, mentions:DraftMention[]=[], images:string[]=[], links:string[]=[]): Promise<string> {
  const action={kind:'cast',images,links,...encodeMentionText(text,mentions),...(parent?{parent:{fid:parent.data.fid,hash:parent.hash}}:{}),...(quote?{quote:{fid:quote.data.fid,hash:quote.hash}}:{})};
  const body=newCastBody(action);
  if(requiresCastPro(body)&&!await getProStatus(config,session.fid))throw new Error('Active Farcaster Pro is required for text over 1,024 UTF-8 bytes.');
  let hash:string;
  if(session.remote)hash=await serverAction(action);
  else{
    requireLocal();
    // @ts-expect-error Shared modern builder supports the 10k cast type and four embeds.
    const {buildCastMessage}=await import('../../replacement.mjs');
    const message=await buildCastMessage(body,session.fid,session.signer);
    hash=await submit(config,message);
  }
  return hash;
}
export async function deleteCast(config:Config,session:Session,cast:Cast,onSubmitted?:()=>void):Promise<void> {
  if(session.fid!==cast.data.fid)throw new Error('You can only delete your own casts.');
  if(!/^0x[0-9a-fA-F]{40}$/.test(cast.hash))throw new Error('Invalid cast hash.');
  if(session.remote)await serverAction({kind:'deleteCast',targetFid:cast.data.fid,targetHash:cast.hash});
  else {
    const message=result(await makeCastRemove({targetHash:hexToBytes(cast.hash as Hex)},{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
    await submit(config,message);
  }
  onSubmitted?.();
}
export async function react(config: Config, session: Session, cast: Cast, kind: 'like'|'recast', remove = false) {
  if (session.remote) return serverAction({kind:'reaction',reaction:kind,targetFid:cast.data.fid,targetHash:cast.hash,remove});
  const body = {type:kind==='like'?ReactionType.LIKE:ReactionType.RECAST,targetCastId:{fid:cast.data.fid,hash:hexToBytes(cast.hash as Hex)}};
  const message = result<Message>(await (remove?makeReactionRemove:makeReactionAdd)(body,{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message);
}
export async function follow(config: Config, session: Session, fid: number, remove = false) {
  if (fid === session.fid) throw new Error('You cannot follow yourself.');
  if (session.remote) return serverAction({kind:'follow',targetFid:fid,remove});
  const message = result<Message>(await (remove?makeLinkRemove:makeLinkAdd)({type:'follow',targetFid:fid},{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message);
}
async function serverAction(action: Record<string,unknown>): Promise<string> {
  const response = await fetch('/api/auth/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action),signal:AbortSignal.timeout(30_000)});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Account action failed.');
  return body.hash;
}

export async function updateProfileField(config:Config,session:Session,type:number,value:string):Promise<string> {
  // @ts-expect-error Shared browser/server field validation.
  const {validateProfileField}=await import('../../profile-fields.mjs');
  validateProfileField(type,value);
  if(session.remote)return serverAction({kind:'profile',type,value});
  const {loadGaslessSdk}=await import('./gasless-sdk');const sdk=await loadGaslessSdk();
  const message=result(await sdk.makeUserDataAdd({type,value},{fid:session.fid,network:sdk.FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message as unknown as Message);
}

export async function setPreferredFname(config:Config,session:Session,value:string):Promise<string> {
  requireLocal();
  // @ts-expect-error Registry name and ownership validation is shared with the server.
  const {fnameName,ownsFnameProof}=await import('../../fname-utils.mjs');const name=fnameName(value);
  const proof=await hub(config,'userNameProofByName',{name});
  if(!ownsFnameProof(proof,name,session.fid))throw new Error('The read node does not confirm this fname belongs to your FID.');
  if(session.remote)return serverAction({kind:'setPreferredFname',name});
  const {loadGaslessSdk}=await import('./gasless-sdk');const sdk=await loadGaslessSdk();
  const message=result(await sdk.makeUserDataAdd({type:6,value:name},{fid:session.fid,network:sdk.FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message as unknown as Message);
}

export async function prepareCastReplacement(config:Config,session:Session,cast:Cast,body:unknown):Promise<{hash:string;bytes:Uint8Array}> {
  if(cast.data.fid!==session.fid)throw new Error('You can only edit your own casts.');
  const source={fid:cast.data.fid,hash:cast.hash,timestamp:cast.data.timestamp};
  if(session.remote){
    const response=await fetch('/api/auth/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'prepareCastReplacement',source,body}),signal:AbortSignal.timeout(30_000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not prepare the replacement.');
    if(typeof result.message!=='string'||!/^0x[0-9a-f]{40}$/i.test(result.hash))throw new Error('Invalid prepared replacement.');
    const bytes=Uint8Array.from(atob(result.message),character=>character.charCodeAt(0));
    const decoded=Message.decode(bytes),data=decoded.dataBytes?MessageData.decode(decoded.dataBytes):decoded.data;
    if(data?.fid!==session.fid||data.type!==1||bytesToHex(decoded.hash)!==result.hash||result.hash.toLowerCase()===cast.hash.toLowerCase())throw new Error('Invalid prepared replacement.');
    return {hash:result.hash,bytes};
  }
  requireLocal();
  // @ts-expect-error Shared modern cast builder preserves all embed and parent types.
  const {buildReplacementMessage}=await import('../../replacement.mjs');
  const message=await buildReplacementMessage(body,source,session.fid,session.signer);
  return {hash:bytesToHex(message.hash),bytes:encodeForSnapchain(message)};
}
