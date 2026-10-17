import { CastType, FarcasterNetwork, ID_REGISTRY_ADDRESS, KEY_GATEWAY_ADDRESS, KEY_REGISTRY_ADDRESS, Message, MessageData, NobleEd25519Signer, ReactionType, ViemLocalEip712Signer, idRegistryABI, keyGatewayABI, keyRegistryABI, makeCastAdd, makeReactionAdd, makeReactionRemove, makeLinkAdd, makeLinkRemove } from '@farcaster/core';
import { createPublicClient, createWalletClient, http, bytesToHex, hexToBytes, formatEther, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { hub, localOrigin, type Config, type Cast } from './hub';
import { saveAppKey, unlockAppKey } from './vault';

export type Session = { fid: number; address: Hex; key: Hex; signer: NobleEd25519Signer };
export type PreparedKey = { fid: number; address: Hex; key: Hex; estimatedFee: string; register: () => Promise<Session>; discard: () => void };
function requireLocal() { if (!localOrigin()) throw new Error('Run Freecast on localhost to import or use an account.'); }
const publicClient = (config: Config) => createPublicClient({ chain: optimism, transport: http(config.optimismRpcUrl) });
function result<T>(r: { isErr: () => boolean; error?: unknown; value?: T }): T { if (r.isErr()) throw new Error(String(r.error)); return r.value!; }

export async function prepareKey(config: Config, phrase: string, password: string, accountIndex: number): Promise<PreparedKey> {
  requireLocal();
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0 || accountIndex > 100) throw new Error('Account index must be between 0 and 100.');
  const account = mnemonicToAccount(phrase.trim().toLowerCase().replace(/\s+/g,' '), { addressIndex: accountIndex });
  const client = publicClient(config);
  const fid = Number(await client.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'idOf',args:[account.address]}));
  if (!fid) throw new Error(`No FID is owned by ${account.address}. Check the custody phrase and derivation index.`);
  const storage = await hub<{ units?: number; unitDetails?: {unitSize: number}[] }>(config,'storageLimitsByFid',{fid});
  if (!(Number(storage.units) > 0)) throw new Error('This account has no active storage. Rent storage before registering an app key.');
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const signer = new NobleEd25519Signer(privateKey);
  const key = bytesToHex(result(await signer.getSignerKey()));
  const metadata = bytesToHex(result(await new ViemLocalEip712Signer(account).getSignedKeyRequestMetadata({requestFid:BigInt(fid),key:hexToBytes(key),deadline:BigInt(Math.floor(Date.now()/1000)+3600)})));
  const args = [1,key,1,metadata] as const;
  await client.simulateContract({address:KEY_GATEWAY_ADDRESS,abi:keyGatewayABI,functionName:'add',args,account});
  const gas = await client.estimateContractGas({address:KEY_GATEWAY_ADDRESS,abi:keyGatewayABI,functionName:'add',args,account});
  const gasPrice = await client.getGasPrice();
  let used = false;
  return { fid,address:account.address,key,estimatedFee:formatEther(gas*gasPrice),discard:()=>{used=true;privateKey.fill(0);},register:async()=>{
    if (used) throw new Error('Prepare a fresh registration.');
    // Save the encrypted signer before sending the transaction, so an interrupted confirmation does not lose it.
    await saveAppKey(password,privateKey,{fid,address:account.address,key});
    const wallet = createWalletClient({account,chain:optimism,transport:http(config.optimismRpcUrl)});
    const hash = await wallet.writeContract({address:KEY_GATEWAY_ADDRESS,abi:keyGatewayABI,functionName:'add',args});
    const receipt = await client.waitForTransactionReceipt({hash});
    if (receipt.status !== 'success') throw new Error(`Registration reverted: ${hash}`);
    used = true;
    return {fid,address:account.address,key,signer:new NobleEd25519Signer(privateKey.slice())};
  }};
}
export async function unlockSession(config: Config, password: string): Promise<Session> {
  requireLocal();
  const saved = await unlockAppKey(password);
  const signer = new NobleEd25519Signer(saved.privateKey);
  if (bytesToHex(result(await signer.getSignerKey())).toLowerCase() !== saved.key.toLowerCase()) throw new Error('Saved key does not match its public key.');
  const state = await publicClient(config).readContract({address:KEY_REGISTRY_ADDRESS,abi:keyRegistryABI,functionName:'keys',args:[BigInt(saved.fid),saved.key]});
  if (Number(state[0]) !== 1) throw new Error('This app key is not registered or was revoked. Import the custody phrase to register a new key.');
  return {fid:saved.fid,address:saved.address,key:saved.key,signer};
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
  if (!config.validatorUrl) throw new Error('Set VALIDATOR_URL in .env and restart the client to enable posting.');
  const bytes = encodeForSnapchain(message);
  const response = await fetch('/api/write/v1/submitMessage',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:new Uint8Array(bytes),signal:AbortSignal.timeout(25_000)});
  if (!response.ok) throw new Error(`Validator returned ${response.status}: ${(await response.text()).slice(0,350)}`);
  return bytesToHex(message.hash);
}
export async function postCast(config: Config, session: Session, text: string, parent?: Cast): Promise<string> {
  const length = new TextEncoder().encode(text).length;
  if (!text.trim() || length > 1024) throw new Error('Write between 1 and 1,024 UTF-8 bytes.');
  const message = result(await makeCastAdd({text,mentions:[],mentionsPositions:[],embeds:[],embedsDeprecated:[],type:length<=320?CastType.CAST:CastType.LONG_CAST,...(parent ? {parentCastId:{fid:parent.data.fid,hash:hexToBytes(parent.hash as Hex)}} : {})},{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
  const hash = await submit(config,message);
  // Acceptance is not inclusion. Poll our read node and never claim success early.
  for (let i=0;i<12;i++) {
    await new Promise(r=>setTimeout(r,2500));
    try { await hub(config,'castById',{fid:session.fid,hash}); return hash; } catch { /* node may still be syncing */ }
  }
  throw new Error(`Accepted by validator; inclusion is not confirmed yet. Check FID ${session.fid}, hash ${hash} before retrying.`);
}
export async function react(config: Config, session: Session, cast: Cast, kind: 'like'|'recast', remove = false) {
  const body = {type:kind==='like'?ReactionType.LIKE:ReactionType.RECAST,targetCastId:{fid:cast.data.fid,hash:hexToBytes(cast.hash as Hex)}};
  const message = result<Message>(await (remove?makeReactionRemove:makeReactionAdd)(body,{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message);
}
export async function follow(config: Config, session: Session, fid: number, remove = false) {
  if (fid === session.fid) throw new Error('You cannot follow yourself.');
  const message = result<Message>(await (remove?makeLinkRemove:makeLinkAdd)({type:'follow',targetFid:fid},{fid:session.fid,network:FarcasterNetwork.MAINNET},session.signer));
  return submit(config,message);
}
