import { newCastBody, requiresCastPro } from './cast.mjs';
import { activeProSubscription } from './pro-subscription.mjs';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sessionStore, SessionStorageError } from './session-store.mjs';
import { parseEnv } from 'node:util';
import { mnemonicToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { bytesToHex, hexToBytes, createPublicClient, http } from 'viem';
import {
  NobleEd25519Signer, ViemLocalEip712Signer, Message, MessageData,
  ID_REGISTRY_ADDRESS, KEY_REGISTRY_ADDRESS, idRegistryABI, keyRegistryABI,
  FarcasterNetwork, ReactionType,
  makeCastRemove, makeReactionAdd, makeReactionRemove, makeLinkAdd, makeLinkRemove,
} from '@farcaster/core';

import { buildCastMessage, buildReplacementMessage, replacementBody } from './replacement.mjs';
import { loadModernSdk } from './modern-sdk.mjs';
import { validateProfileField } from './profile-fields.mjs';
import { fnameName, ownsFnameProof } from './fname-utils.mjs';
import { writeOrigin } from './proxy.mjs';

const COOKIE = 'freecast_session';
const PENDING_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 24 * 60 * 60_000;
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class RegistrationPending extends Error {}
class SignerInactive extends Failure {
  constructor(){super(403,'The approved signer is inactive or has been revoked.');}
}
const unwrap = result => { if (result.isErr()) throw new Failure(400, result.error.message); return result.value; };

function originFor(req, config) {
  const url=writeOrigin(req,config);
  if(req.headers.host!==url.host)throw new Failure(403,'Unexpected request host.');
  return url;
}
function canConnect(origin) {
  return origin.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
}
function cookieValue(req) {
  const match = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='));
  const value = match?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : undefined;
}
function setCookie(res, id, origin, seconds) {
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${origin.protocol === 'https:' ? '; Secure' : ''}`);
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw new Failure(413, 'Request too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw new Failure(400, 'Invalid JSON.'); }
}

export async function loadApprovalIdentity(config) {
  let fid = config.FARCASTER_APP_FID;
  let mnemonic = config.FARCASTER_APP_MNEMONIC;
  if (config.FARCASTER_APP_ENV_FILE && (!fid || !mnemonic)) {
    // Read only the selected app identity. Never merge another app's hub or DB configuration.
    const existing = parseEnv(await readFile(config.FARCASTER_APP_ENV_FILE, 'utf8'));
    fid ||= existing.DEVELOPER_FID;
    mnemonic ||= existing.DEVELOPER_MNEMONIC;
  }
  if (!fid || !mnemonic) throw new Failure(503, 'Farcaster approval is not configured. Set the server-only app FID and mnemonic.');
  if (!Number.isSafeInteger(Number(fid)) || Number(fid) <= 0) throw new Failure(503, 'The server app FID is invalid.');
  return { fid: Number(fid), account: mnemonicToAccount(mnemonic) };
}

async function verifyRegistration(config, fid, key, request) {
  const client = createPublicClient({chain:optimism,transport:http(config.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io')});
  const state = await client.readContract({address:KEY_REGISTRY_ADDRESS,abi:keyRegistryABI,functionName:'keys',args:[BigInt(fid),key]});
  if (Number(state[0]) === 0) throw new RegistrationPending();
  if (Number(state[0]) !== 1 || Number(state[1]) !== 1) throw new SignerInactive();
  const address = await client.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'custodyOf',args:[BigInt(fid)]});
  const response = await request(new URL(`/v1/storageLimitsByFid?fid=${fid}`,config.NEXT_PUBLIC_HUBURL || 'http://127.0.0.1:3381'),{signal:AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Failure(502, 'Could not check account storage.');
  if (!(Number((await response.json()).units) > 0)) throw new Failure(403, 'The approved account needs active Farcaster storage.');
  return address;
}

async function buildAction(session, action,checkCastPro,checkFname) {
  const signer = new NobleEd25519Signer(session.privateKey);
  const options = {fid:session.fid,network:FarcasterNetwork.MAINNET};
  if(action.kind==='setPreferredFname'){
    let name;try{name=fnameName(action.name);}catch(error){throw new Failure(400,error.message);}
    await checkFname(name);
    const sdk=await loadModernSdk();return unwrap(await sdk.makeUserDataAdd({type:6,value:name},options,new sdk.NobleEd25519Signer(session.privateKey)));
  }
  if(action.kind==='prepareCastReplacement'){
    const sdk=await loadModernSdk();
    try{await checkCastPro(replacementBody(action.body));return await buildReplacementMessage(action.body,action.source,session.fid,new sdk.NobleEd25519Signer(session.privateKey));}
    catch(error){if(error instanceof Failure)throw error;throw new Failure(400,error.message);}
  }
  if(action.kind==='profile'){
    try{validateProfileField(action.type,action.value);}catch(error){throw new Failure(400,error.message);}
    const sdk=await loadModernSdk();
    return unwrap(await sdk.makeUserDataAdd({type:action.type,value:action.value},options,new sdk.NobleEd25519Signer(session.privateKey)));
  }
  if (action.kind === 'cast') {
    let body;try{body=newCastBody(action);}catch(error){throw new Failure(400,error.message);}
    await checkCastPro(body);
    const sdk=await loadModernSdk();
    try{return await buildCastMessage(body,session.fid,new sdk.NobleEd25519Signer(session.privateKey));}
    catch(error){throw new Failure(400,error.message);}
  }
  if (action.kind === 'deleteCast') {
    if(action.targetFid!==session.fid)throw new Failure(403,'You can only delete your own casts.');
    if(!/^0x[0-9a-fA-F]{40}$/.test(action.targetHash))throw new Failure(400,'Invalid cast hash.');
    return unwrap(await makeCastRemove({targetHash:hexToBytes(action.targetHash)},options,signer));
  }
  if (action.kind === 'reaction') {
    if (!['like','recast'].includes(action.reaction) || !Number.isSafeInteger(action.targetFid) || action.targetFid <= 0 || !/^0x[0-9a-fA-F]{40}$/.test(action.targetHash)) throw new Failure(400, 'Invalid reaction target.');
    return unwrap(await (action.remove ? makeReactionRemove : makeReactionAdd)({type:action.reaction==='like'?ReactionType.LIKE:ReactionType.RECAST,targetCastId:{fid:action.targetFid,hash:hexToBytes(action.targetHash)}},options,signer));
  }
  if (action.kind === 'follow') {
    if (!Number.isSafeInteger(action.targetFid) || action.targetFid <= 0 || action.targetFid === session.fid) throw new Failure(400, 'Invalid follow target.');
    return unwrap(await (action.remove ? makeLinkRemove : makeLinkAdd)({type:'follow',targetFid:action.targetFid},options,signer));
  }
  throw new Failure(400, 'Unknown account action.');
}

export function approval(config, dependencies = {}) {
  const request = dependencies.fetch || ((...args) => fetch(...args));
  const now = dependencies.now || Date.now;
  const verify = dependencies.verify || ((fid,key) => verifyRegistration(config,fid,key,request));
  const sessions = new Map();
  const store=dependencies.store||sessionStore(config.FREECAST_SESSION_DIR||undefined);
  let ready;
  const starts = new Map();
  let identity;
  const api = 'https://api.farcaster.xyz/v2';

  async function erase(id) { const session=sessions.get(id);if(session){session.privateKey.fill(0);session.state='removed';}await store.remove(id);sessions.delete(id); }
  async function prune() {
    for(const [id,session] of sessions)if(session.expires<=now())await erase(id);
    for(const [ip,record] of starts)if(record.expires<=now())starts.delete(ip);
  }
  async function restore(){
    for(const session of sessions.values())session.privateKey.fill(0);sessions.clear();
    for(const [id,session] of await store.load()){
      if(session.state==='active')session.needsVerification=true;
      sessions.set(id,session);
    }
    await prune();
  }
  async function verifyRestored(id,session){
    if(!session.needsVerification)return;
    session.verification ||= (async()=>{
      try{const address=await verify(session.fid,session.key);if(sessions.get(id)===session&&session.state==='active'){session.address=address;session.needsVerification=false;}}
      catch(error){if(error instanceof RegistrationPending||error instanceof SignerInactive){await erase(id);throw new Failure(403,'The saved signer is inactive or has been revoked.');}throw error;}
    })();
    try{await session.verification;}finally{delete session.verification;}
  }
  const publicSession = session => ({fid:session.fid,address:session.address,key:session.key,remote:true});

  return async (req,res,next) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (!path.startsWith('/api/auth/')) return next();
    try {
      const origin = originFor(req,config);
      if (!canConnect(origin)) throw new Failure(403, 'Open Freecast through localhost or HTTPS to connect an account.');
      if (origin.protocol !== 'https:' && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) throw new Failure(403, 'Localhost account connections must originate on this server.');
      const expectedMethod = path === '/api/auth/session' ? 'GET' : 'POST';
      if (req.method !== expectedMethod) throw new Failure(405, 'Method not allowed.');
      if (req.method === 'POST' && req.headers.origin !== origin.origin) throw new Failure(403, 'Origin mismatch.');
      if (!['/api/auth/start','/api/auth/session','/api/auth/action','/api/auth/logout'].includes(path)) throw new Failure(404, 'Unknown account endpoint.');
      try{await (ready ||= restore());}catch(error){ready=undefined;throw error;}await prune();
      let id = cookieValue(req);
      let session = id && sessions.get(id);
      if(session&&!(await store.has(id))){session.privateKey.fill(0);sessions.delete(id);session=undefined;}
      if(session&&(session.origin!==origin.origin||(session.state==='removed'&&path!=='/api/auth/logout')))session=undefined;
      if(session?.state==='active'&&path!=='/api/auth/logout'){
        await verifyRestored(id,session);
        if(sessions.get(id)!==session||session.state!=='active'||session.expires<=now())session=undefined;
      }

      if (path === '/api/auth/start') {
        if (session?.state === 'active') return send(res,200,{state:'active',session:publicSession(session)});
        if (session?.state === 'pending') return send(res,200,{state:'pending',deepLinkUrl:session.deepLinkUrl,key:session.key});
        const ip = req.socket?.remoteAddress || 'unknown';
        const rate = starts.get(ip) || {count:0,expires:now()+60*60_000};
        if (rate.count >= 10 || sessions.size >= 1000) throw new Failure(429, 'Too many approval requests. Try again later.');
        rate.count++; starts.set(ip,rate);
        identity ||= loadApprovalIdentity(config);
        const app = await identity;
        const privateKey = randomBytes(32);
        try {
          const key = bytesToHex(unwrap(await new NobleEd25519Signer(privateKey).getSignerKey()));
          const deadline = BigInt(Math.floor(now()/1000)+15*60);
          const signature = bytesToHex(unwrap(await new ViemLocalEip712Signer(app.account).signKeyRequest({requestFid:BigInt(app.fid),key:hexToBytes(key),deadline})));
          const response = await request(api+'/signed-key-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,signature,requestFid:app.fid,deadline:Number(deadline)}),signal:AbortSignal.timeout(20_000),redirect:'error'});
          if (!response.ok) throw new Failure(502, `Farcaster rejected the approval request (${response.status}). Check the server app identity.`);
          const data = (await response.json()).result?.signedKeyRequest;
          if (!data?.token || !data?.deeplinkUrl || !['https:','farcaster:','warpcast:'].includes(new URL(data.deeplinkUrl).protocol)) throw new Failure(502, 'Invalid Farcaster approval response.');
          id = randomBytes(32).toString('hex');
          sessions.set(id,{state:'pending',origin:origin.origin,privateKey:new Uint8Array(privateKey),key,token:data.token,deepLinkUrl:data.deeplinkUrl,expires:now()+PENDING_TTL,lastPoll:0});
          try{await store.save(id,sessions.get(id));}catch(error){await erase(id);throw error;}
          setCookie(res,id,origin,PENDING_TTL/1000);
          return send(res,200,{state:'pending',deepLinkUrl:data.deeplinkUrl,key});
        } finally { privateKey.fill(0); }
      }

      if (path === '/api/auth/logout') {
        if (id&&session) await erase(id);
        setCookie(res,'',origin,0);
        return send(res,200,{state:'none'});
      }

      if (path === '/api/auth/session') {
        if (!session) return send(res,200,{state:'none'});
        if (session.state === 'active') {setCookie(res,id,origin,Math.max(1,Math.floor((session.expires-now())/1000)));return send(res,200,{state:'active',session:publicSession(session)});}
        if (session.polling || now()-session.lastPoll < 1500) return send(res,200,{state:'pending'});
        session.polling = true; session.lastPoll = now();
        try {
          const response = await request(api+'/signed-key-request?'+new URLSearchParams({token:session.token}),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20_000),redirect:'error'});
          if (!response.ok) throw new Failure(502, 'Could not check Farcaster approval. Try again.');
          const data = (await response.json()).result?.signedKeyRequest;
          if (!data?.state) throw new Failure(502, 'Invalid approval status response.');
          if (['expired','cancelled','failed'].includes(data.state)) { await erase(id); throw new Failure(400, 'Approval expired or was cancelled. Create a new request.'); }
          if (!['completed','approved'].includes(data.state)) return send(res,200,{state:'pending'});
          const fid = Number(data.userFid);
          if (!Number.isSafeInteger(fid) || fid <= 0) throw new Failure(502, 'Farcaster did not return a valid approved FID.');
          try { session.address = await verify(fid,session.key); }
          catch (error) { if (error instanceof RegistrationPending) return send(res,200,{state:'pending',message:'Waiting for onchain signer registration.'}); throw error; }
          if (sessions.get(id) !== session || session.state!=='pending' || session.expires <= now()) {
            await erase(id);
            return send(res,200,{state:'none'});
          }
          const activated={...session,fid,state:'active',expires:now()+SESSION_TTL};
          await store.save(id,activated);
          if(sessions.get(id)!==session||session.state!=='pending'||session.expires<=now()){await erase(id);return send(res,200,{state:'none'});}
          Object.assign(session,activated);
          delete session.token;delete session.deepLinkUrl;
          setCookie(res,id,origin,SESSION_TTL/1000);
          return send(res,200,{state:'active',session:publicSession(session)});
        } finally { session.polling = false; }
      }

      if (!session || session.state !== 'active') throw new Failure(401, 'Connect and approve an account first.');
      if (!config.VALIDATOR_URL) throw new Failure(503, 'Configure the server submission endpoint before publishing.');
      const action = await readBody(req);
      if (sessions.get(id) !== session || session.state!=='active' || session.expires <= now()) throw new Failure(401, 'This account session has ended.');
      const message = await buildAction(session,action,async body=>{
        if(!requiresCastPro(body))return;
        let pro;
        try{
          const target=new URL('/v1/storageLimitsByFid',config.NEXT_PUBLIC_HUBURL||'http://127.0.0.1:3381');target.searchParams.set('fid',String(session.fid));
          const response=await request(target,{signal:AbortSignal.timeout(12_000),redirect:'error'});
          if(!response.ok)throw new Error('Unavailable');pro=activeProSubscription(await response.json(),now()/1000);
        }catch{throw new Failure(503,'Could not verify Farcaster Pro status. Your draft is kept; retry when the read node is available.');}
        if(!pro)throw new Failure(400,'Active Farcaster Pro is required for more than two embeds or text over 1,024 UTF-8 bytes.');
      },async name=>{
        const host=new URL(`http://${req.headers.host}`).hostname,peer=req.socket?.remoteAddress;
        if(!['localhost','127.0.0.1','[::1]'].includes(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))throw new Failure(403,'Fname changes are available only on localhost.');
        const target=new URL('/v1/userNameProofByName',config.NEXT_PUBLIC_HUBURL||'http://127.0.0.1:3381');target.searchParams.set('name',name);
        const response=await request(target,{signal:AbortSignal.timeout(12_000),redirect:'error'});
        if(!response.ok||!ownsFnameProof(await response.json(),name,session.fid))throw new Failure(400,'The read node does not confirm this fname belongs to your FID.');
      });
      if (sessions.get(id) !== session || session.state!=='active' || session.expires <= now()) throw new Failure(401, 'This account session has ended.');
      const bytes = Message.encode({...message,dataBytes:MessageData.encode(message.data).finish(),data:undefined}).finish();
      if(action.kind==='prepareCastReplacement')return send(res,200,{hash:bytesToHex(message.hash),message:Buffer.from(bytes).toString('base64')});
      const response = await request(new URL('/v1/submitMessage',config.VALIDATOR_URL),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(25_000),redirect:'error'});
      if (!response.ok) throw new Failure(502, `Submission endpoint rejected the message (${response.status}).`);
      return send(res,200,{hash:bytesToHex(message.hash),accepted:true});
    } catch (error) {
      return send(res,error instanceof SessionStorageError?503:error instanceof Failure?error.status:502,{error:error instanceof Failure||error instanceof SessionStorageError?error.message:'Could not complete account approval. Check server configuration and try again.'});
    }
  };
}
