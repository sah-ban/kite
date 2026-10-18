import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { mnemonicToAccount } from 'viem/accounts';
import { optimism } from 'viem/chains';
import { bytesToHex, hexToBytes, createPublicClient, http } from 'viem';
import {
  NobleEd25519Signer, ViemLocalEip712Signer, Message, MessageData,
  ID_REGISTRY_ADDRESS, KEY_REGISTRY_ADDRESS, idRegistryABI, keyRegistryABI,
  FarcasterNetwork, CastType, ReactionType,
  makeCastAdd, makeCastRemove, makeReactionAdd, makeReactionRemove, makeLinkAdd, makeLinkRemove,
} from '@farcaster/core';

const COOKIE = 'freecast_session';
const PENDING_TTL = 10 * 60_000;
const SESSION_TTL = 8 * 60 * 60_000;
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class RegistrationPending extends Error {}
const unwrap = result => { if (result.isErr()) throw new Failure(400, result.error.message); return result.value; };

function originFor(req, config) {
  if (config.FREECAST_PUBLIC_URL) {
    const url = new URL(config.FREECAST_PUBLIC_URL);
    if (req.headers.host !== url.host) throw new Failure(403, 'Unexpected request host.');
    return url;
  }
  return new URL(`${req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`);
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
    if (size > 16_000) throw new Failure(413, 'Request too large.');
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
  if (Number(state[0]) !== 1 || Number(state[1]) !== 1) throw new Failure(403, 'The approved signer is inactive or has been revoked.');
  const address = await client.readContract({address:ID_REGISTRY_ADDRESS,abi:idRegistryABI,functionName:'custodyOf',args:[BigInt(fid)]});
  const response = await request(new URL(`/v1/storageLimitsByFid?fid=${fid}`,config.NEXT_PUBLIC_HUBURL || 'http://127.0.0.1:3381'),{signal:AbortSignal.timeout(20_000)});
  if (!response.ok) throw new Failure(502, 'Could not check account storage.');
  if (!(Number((await response.json()).units) > 0)) throw new Failure(403, 'The approved account needs active Farcaster storage.');
  return address;
}

async function buildAction(session, action) {
  const signer = new NobleEd25519Signer(session.privateKey);
  const options = {fid:session.fid,network:FarcasterNetwork.MAINNET};
  if (action.kind === 'cast') {
    const bytes = typeof action.text === 'string' ? Buffer.byteLength(action.text) : 0;
    const mentions=action.mentions??[],mentionsPositions=action.mentionsPositions??[];
    if(!Array.isArray(mentions)||!Array.isArray(mentionsPositions)||mentions.length>10||mentions.length!==mentionsPositions.length||mentions.some(fid=>!Number.isSafeInteger(fid)||fid<=0)||mentionsPositions.some((position,index)=>!Number.isSafeInteger(position)||position<0||position>bytes||(index>0&&position<mentionsPositions[index-1])))throw new Failure(400,'Invalid mentions.');
    const boundaries=new Set([0]);let offset=0;for(const character of typeof action.text==='string'?action.text:''){offset+=Buffer.byteLength(character);boundaries.add(offset);}
    if(mentionsPositions.some(position=>!boundaries.has(position)))throw new Failure(400,'Invalid mention position.');
    if(typeof action.text!=='string'||bytes>1024||(!action.text.trim()&&!action.quote&&!mentions.length))throw new Failure(400,'Write up to 1,024 UTF-8 bytes or add a mention or quoted cast.');
    const embeds=[];
    if(action.quote){
      if(!Number.isSafeInteger(action.quote.fid)||action.quote.fid<=0||!/^0x[0-9a-fA-F]{40}$/.test(action.quote.hash))throw new Failure(400,'Invalid quoted cast.');
      embeds.push({castId:{fid:action.quote.fid,hash:hexToBytes(action.quote.hash)}});
    }
    let parentCastId;
    if (action.parent) {
      if (!Number.isSafeInteger(action.parent.fid) || action.parent.fid <= 0 || !/^0x[0-9a-fA-F]{40}$/.test(action.parent.hash)) throw new Failure(400, 'Invalid reply target.');
      parentCastId = {fid:action.parent.fid,hash:hexToBytes(action.parent.hash)};
    }
    return unwrap(await makeCastAdd({text:action.text,mentions,mentionsPositions,embeds,embedsDeprecated:[],type:bytes<=320?CastType.CAST:CastType.LONG_CAST,parentCastId},options,signer));
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
  const starts = new Map();
  let identity;
  const api = 'https://api.farcaster.xyz/v2';

  function erase(id) { const session=sessions.get(id); session?.privateKey.fill(0); sessions.delete(id); }
  function prune() {
    for (const [id,session] of sessions) if (session.expires <= now()) erase(id);
    for (const [ip,record] of starts) if (record.expires <= now()) starts.delete(ip);
  }
  const publicSession = session => ({fid:session.fid,address:session.address,key:session.key,remote:true});

  return async (req,res,next) => {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (!path.startsWith('/api/auth/')) return next();
    try {
      prune();
      const origin = originFor(req,config);
      if (!canConnect(origin)) throw new Failure(403, 'Open Freecast through localhost or HTTPS to connect an account.');
      if (origin.protocol !== 'https:' && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) throw new Failure(403, 'Localhost account connections must originate on this server.');
      const expectedMethod = path === '/api/auth/session' ? 'GET' : 'POST';
      if (req.method !== expectedMethod) throw new Failure(405, 'Method not allowed.');
      if (req.method === 'POST' && req.headers.origin !== origin.origin) throw new Failure(403, 'Origin mismatch.');
      if (!['/api/auth/start','/api/auth/session','/api/auth/action','/api/auth/logout'].includes(path)) throw new Failure(404, 'Unknown account endpoint.');
      let id = cookieValue(req);
      let session = id && sessions.get(id);

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
          sessions.set(id,{state:'pending',privateKey:new Uint8Array(privateKey),key,token:data.token,deepLinkUrl:data.deeplinkUrl,expires:now()+PENDING_TTL,lastPoll:0});
          setCookie(res,id,origin,PENDING_TTL/1000);
          return send(res,200,{state:'pending',deepLinkUrl:data.deeplinkUrl,key});
        } finally { privateKey.fill(0); }
      }

      if (path === '/api/auth/logout') {
        if (id) erase(id);
        setCookie(res,'',origin,0);
        return send(res,200,{state:'none'});
      }

      if (path === '/api/auth/session') {
        if (!session) return send(res,200,{state:'none'});
        if (session.state === 'active') return send(res,200,{state:'active',session:publicSession(session)});
        if (session.polling || now()-session.lastPoll < 1500) return send(res,200,{state:'pending'});
        session.polling = true; session.lastPoll = now();
        try {
          const response = await request(api+'/signed-key-request?'+new URLSearchParams({token:session.token}),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20_000),redirect:'error'});
          if (!response.ok) throw new Failure(502, 'Could not check Farcaster approval. Try again.');
          const data = (await response.json()).result?.signedKeyRequest;
          if (!data?.state) throw new Failure(502, 'Invalid approval status response.');
          if (['expired','cancelled','failed'].includes(data.state)) { erase(id); throw new Failure(400, 'Approval expired or was cancelled. Create a new request.'); }
          if (!['completed','approved'].includes(data.state)) return send(res,200,{state:'pending'});
          const fid = Number(data.userFid);
          if (!Number.isSafeInteger(fid) || fid <= 0) throw new Failure(502, 'Farcaster did not return a valid approved FID.');
          try { session.address = await verify(fid,session.key); }
          catch (error) { if (error instanceof RegistrationPending) return send(res,200,{state:'pending',message:'Waiting for onchain signer registration.'}); throw error; }
          if (sessions.get(id) !== session || session.expires <= now()) {
            erase(id);
            return send(res,200,{state:'none'});
          }
          session.fid = fid; session.state = 'active'; session.expires = now()+SESSION_TTL;
          delete session.token; delete session.deepLinkUrl;
          setCookie(res,id,origin,SESSION_TTL/1000);
          return send(res,200,{state:'active',session:publicSession(session)});
        } finally { session.polling = false; }
      }

      if (!session || session.state !== 'active') throw new Failure(401, 'Connect and approve an account first.');
      if (!config.VALIDATOR_URL) throw new Failure(503, 'Configure the server submission endpoint before publishing.');
      const action = await readBody(req);
      if (sessions.get(id) !== session || session.expires <= now()) throw new Failure(401, 'This account session has ended.');
      const message = await buildAction(session,action);
      if (sessions.get(id) !== session || session.expires <= now()) throw new Failure(401, 'This account session has ended.');
      const bytes = Message.encode({...message,dataBytes:MessageData.encode(message.data).finish(),data:undefined}).finish();
      const response = await request(new URL('/v1/submitMessage',config.VALIDATOR_URL),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(25_000),redirect:'error'});
      if (!response.ok) throw new Failure(502, `Submission endpoint rejected the message (${response.status}).`);
      return send(res,200,{hash:bytesToHex(message.hash),accepted:true});
    } catch (error) {
      return send(res,error instanceof Failure?error.status:502,{error:error instanceof Failure?error.message:'Could not complete account approval. Check server configuration and try again.'});
    }
  };
}
