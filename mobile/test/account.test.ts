import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {ed25519} from '@noble/curves/ed25519';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils';
import {castSdk} from '../src/lib/cast-sdk';
import {createAccount,type AccountStorage} from '../src/lib/account-core';
import {pushClaim} from '../../push-proof.mjs';
import {mobileClaim} from '../../mobile-proof.mjs';

let Message:Awaited<ReturnType<typeof castSdk>>['Message'],validations:Awaited<ReturnType<typeof castSdk>>['validations'];
before(async()=>{({Message,validations}=await castSdk());});

const origin='https://kite.example',address='0x'+'11'.repeat(20),now=1700000000000;
const target={hash:'0x'+'22'.repeat(20),signer:'public',data:{fid:37,timestamp:1,castAddBody:{text:'Fixture'}}};

test('follow and unfollow sign the target link with the connected account and reject self-follow',async()=>{
  const h=harness(),account=h.create();await account.restore();await assert.rejects(account.follow(37,false),/Sign in/);
  await account.begin();h.approve();await account.check();
  await account.follow(37,false);await account.follow(37,true);
  const {castSdk}=await import('../src/lib/cast-sdk'),sdk=await castSdk();
  for(const [index,type] of [sdk.MessageType.LINK_ADD,sdk.MessageType.LINK_REMOVE].entries()){
    const message=sdk.Message.decode(h.submitted[index]);assert.equal(message.data?.fid,545039);assert.equal(message.data?.type,type);assert.equal(message.data?.linkBody?.targetFid,37);assert.equal(message.data?.linkBody?.type,'follow');assert.ok((await sdk.validations.validateMessage(message)).isOk());
  }
  assert.ok(sdk.Message.decode(h.submitted[1]).data!.timestamp>sdk.Message.decode(h.submitted[0]).data!.timestamp);
  await assert.rejects(account.follow(545039,false),/Invalid/);assert.equal(h.submitted.length,2);
});
test('profile edits validate every field before submission and report only accepted changes',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();
  await assert.rejects(account.updateProfile({name:'A valid name',bio:'🌱'.repeat(65)}),/256/);assert.equal(h.submitted.length,0);
  await assert.rejects(account.updateProfile({website:'javascript:alert(1)'}),/URL/);
  const accepted:unknown[]=[];await account.updateProfile({name:'Kite tester',bio:'Updated bio',avatar:'https://example.com/avatar.gif'},value=>accepted.push(value));
  const {castSdk}=await import('../src/lib/cast-sdk'),sdk=await castSdk();
  assert.equal(JSON.stringify(accepted),JSON.stringify([{name:'Kite tester'},{bio:'Updated bio'},{avatar:'https://example.com/avatar.gif'}]));
  for(const message of h.submitted.map(bytes=>sdk.Message.decode(bytes))){assert.equal(message.data?.type,sdk.MessageType.USER_DATA_ADD);assert.equal(message.data?.fid,545039);assert.ok((await sdk.validations.validateMessage(message)).isOk());}
  h.failPost(true);await assert.rejects(account.updateProfile({name:'Not accepted'},value=>accepted.push(value)),/Node unavailable/);assert.equal(accepted.length,3);
});
test('a partial profile save reports accepted fields and stops at the first failure',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();let requests=0;
  h.api.submit=async bytes=>{if(++requests===2)throw new Error('Second field failed');h.submitted.push(bytes);};
  const accepted:unknown[]=[];await assert.rejects(account.updateProfile({name:'Accepted',bio:'Not saved',website:'https://example.com'},value=>accepted.push(value)),/Second field/);
  assert.deepEqual(accepted,[{name:'Accepted'}]);assert.equal(h.submitted.length,1);assert.equal(requests,2);
});
function harness(){
  let saved:string|null=null,counter=1,approved=false,failSave=false,failPost=false;
  let seedCount=0,approvalCalls=0,providerPolls=0;
  const submitted:Uint8Array[]=[],claims:unknown[]=[];
  const storage:AccountStorage={get:async()=>saved,set:async(value)=>{if(failSave)throw Error('Storage unavailable');saved=value;},remove:async()=>{saved=null;}};
  const api={origin,accountPost:async<T>(purpose:'approval'|'verify'|'feed'|'push',body:unknown):Promise<T>=>{
    const claim=body as {key:string;signature:string;issuedAt:number;nonce:string;fid?:number;registration?:{installationId:string;token:string;enabled:boolean}};claims.push(body);
    assert.ok(!('privateKey' in claim));assert.ok(saved,'key must be saved before the approval request');
    assert.ok(ed25519.verify(hexToBytes(claim.signature.slice(2)),purpose==='push'?pushClaim(origin,claim.key,claim.issuedAt,claim.nonce,claim.fid,claim.registration):mobileClaim(origin,purpose==='approval'?'approve':purpose,claim.key,claim.issuedAt,claim.nonce,claim.fid||0),hexToBytes(claim.key.slice(2))));
    if(purpose==='approval'){approvalCalls++;return {key:claim.key,token:'fixture-token',deepLinkUrl:'farcaster://signed-key-request?token=fixture-token',appFid:925685,expiresAt:now+900000} as T;}
    if(purpose==='push'){if(failPost)throw Error('Push gateway unavailable');return {registered:claim.registration!.enabled,fid:claim.fid} as T;}
    if(purpose==='feed')return {enrolled:true,fid:claim.fid} as T;
    return {state:'active',key:claim.key,fid:545039,address} as T;
  },approvalStatus:async()=>{providerPolls++;return approved?{state:'completed',userFid:545039}:{state:'pending_approval',userFid:undefined};},submit:async(bytes:Uint8Array)=>{if(failPost)throw Error('Node unavailable');submitted.push(bytes);}};
  const random=async(size:number)=>{if(size===32)seedCount++;return new Uint8Array(size).fill(counter++);};
  const create=()=>createAccount(api,storage,random,()=>now);
  return {create,storage,api,submitted,claims,get saved(){return saved;},get seedCount(){return seedCount;},get approvalCalls(){return approvalCalls;},get providerPolls(){return providerPolls;},approve:()=>{approved=true;},failSave:(value:boolean)=>{failSave=value;},failPost:(value:boolean)=>{failPost=value;},tamper:(value:string)=>{saved=value;}};
}
test('mobile approval saves a device key first, coalesces starts and exposes no secret in public state',async()=>{
  const h=harness(),account=h.create();await account.restore();
  const [a,b]=await Promise.all([account.begin(),account.begin()]);assert.deepEqual(a,b);assert.equal(h.seedCount,1);assert.equal(h.approvalCalls,1);assert.ok(a.pending);assert.equal(a.session,null);
  const stored=JSON.parse(h.saved!);assert.ok(stored.privateKey);assert.ok(!JSON.stringify(a).includes(stored.privateKey));assert.ok(!JSON.stringify(h.claims).includes(stored.privateKey));
  const restored=h.create();assert.deepEqual(await restored.restore(),a);await restored.begin();assert.equal(h.approvalCalls,1);assert.equal(h.seedCount,1);
});
test('completed approval verifies registration, survives restarts and removes the polling token from saved active state',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();assert.equal((await account.check()).session,null);h.approve();
  const active=await account.check();assert.equal(active.session?.fid,545039);assert.equal(active.pending,null);assert.ok(!h.saved!.includes('fixture-token'));const restored=h.create();assert.deepEqual(await restored.restore(),active);assert.equal(h.seedCount,1);
});
test('approved signers add and remove reactions as their own FID without post-submission polling',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();const active=await account.check(),polls=h.providerPolls;
  await account.react(target,'likes',false);await account.react(target,'recasts',true);assert.equal(h.submitted.length,2);assert.equal(h.providerPolls,polls);
  for(const [index,bytes] of h.submitted.entries()){
    const message=Message.decode(bytes);assert.equal('0x'+bytesToHex(message.signer),active.session?.key);const validated=await validations.validateMessage(message);assert.ok(validated.isOk());assert.equal(message.data?.fid,545039);assert.equal(message.data?.type,index===0?3:4);assert.equal(message.data?.reactionBody?.targetCastId?.fid,37);
  }
  await account.signOut();await assert.rejects(account.react(target,'likes',false),/Sign in/);assert.equal(h.saved,null);
});
test('a failed secure write does not report a successful account connection or lose the pending key',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();const pending=h.saved;h.approve();h.failSave(true);await assert.rejects(account.check(),/Storage unavailable/);assert.equal(account.snapshot().session,null);assert.equal(h.saved,pending);h.failSave(false);assert.equal((await account.check()).session?.fid,545039);
});
test('corrupt saved keys cannot be silently replaced, and sign-out resets them explicitly',async()=>{
  const h=harness();h.tamper('{bad-json');const account=h.create();await assert.rejects(account.restore(),/unlock/);await assert.rejects(account.begin(),/unlock/);assert.equal(h.seedCount,0);await account.signOut();await account.begin();assert.equal(h.seedCount,1);
});
test('failed submissions retain the signed-in account and do not claim successful reactions',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();h.failPost(true);await assert.rejects(account.react(target,'likes',false),/Node unavailable/);assert.equal(h.submitted.length,0);assert.equal(account.snapshot().session?.fid,545039);
});

test('casting signs mentions, replies and four embeds using the approved device key and exact dataBytes',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();const active=await account.check(),polls=h.providerPolls;
  const links=Array.from({length:4},(_,i)=>`https://example.com/${i}`);
  const cast=await account.cast({text:'Hello 🌱',mentions:[925685],mentionsPositions:[6],images:[],links,parent:{fid:37,hash:target.hash}});
  assert.equal(h.submitted.length,1);assert.equal(cast.data.fid,545039);assert.equal(cast.signer,active.session?.key);assert.equal(cast.data.castAddBody.embeds?.length,4);assert.equal(h.providerPolls,polls);
  const {castSdk}=await import('../src/lib/cast-sdk');const sdk=await castSdk(),message=sdk.Message.decode(h.submitted[0]);assert.equal(message.data,undefined);assert.ok(message.dataBytes?.length);const data=sdk.MessageData.decode(message.dataBytes!);
  assert.equal(data.fid,545039);assert.deepEqual(data.castAddBody?.mentions,[925685]);assert.deepEqual(data.castAddBody?.mentionsPositions,[6]);assert.equal(data.castAddBody?.embeds.length,4);assert.equal(data.castAddBody?.parentCastId?.fid,37);assert.equal('0x'+bytesToHex(data.castAddBody!.parentCastId!.hash),target.hash);
  assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());assert.equal(cast.hash,'0x'+bytesToHex(message.hash));
});
test('long casts reach submission without a local Pro check and invalid or failed submissions retain the account',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();
  const input={text:'a'.repeat(1025),mentions:[],mentionsPositions:[],images:[],links:[]};
  const cast=await account.cast(input);assert.equal(cast.data.castAddBody.text.length,1025);assert.equal(h.submitted.length,1);
  const {castSdk}=await import('../src/lib/cast-sdk'),sdk=await castSdk();
  const message=sdk.Message.decode(h.submitted[0]),data=sdk.MessageData.decode(message.dataBytes!);
  assert.equal(data.castAddBody?.type,sdk.CastType.TEN_K_CAST);assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());
  await assert.rejects(account.cast({...input,text:'a'.repeat(10001)}),/10,000/);assert.equal(h.submitted.length,1);
  h.failPost(true);await assert.rejects(account.cast(input),/Node unavailable/);assert.equal(account.snapshot().session?.fid,545039);assert.equal(h.submitted.length,1);
});
test('quote-only posts sign a cast embed rather than a reply or URL',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();
  const quote={fid:target.data.fid,hash:target.hash};
  const receipt=await account.cast({text:'',mentions:[],mentionsPositions:[],images:[],links:[],quote});
  const {castSdk}=await import('../src/lib/cast-sdk'),sdk=await castSdk();
  const message=sdk.Message.decode(h.submitted[0]),data=sdk.MessageData.decode(message.dataBytes!);
  const body=data.castAddBody!;assert.equal(body.parentCastId,undefined);assert.equal(body.embeds.length,1);
  assert.equal(body.embeds[0].castId?.fid,quote.fid);assert.equal('0x'+bytesToHex(body.embeds[0].castId!.hash),quote.hash);
  assert.deepEqual(receipt.data.castAddBody.embeds,[{castId:quote}]);
  assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());
});

test('cast deletion signs only the active account’s full cast hash and does not poll after submission',async()=>{
  const h=harness(),account=h.create();await account.restore();
  await assert.rejects(account.deleteCast(target),/Sign in/);
  await account.begin();h.approve();const active=await account.check(),polls=h.providerPolls;
  await assert.rejects(account.deleteCast(target),/own casts/);
  const own={...target,data:{...target.data,fid:545039}};
  await assert.rejects(account.deleteCast({...own,hash:'0x22'}),/own casts/);
  assert.equal(h.submitted.length,0);
  await account.deleteCast(own);
  assert.equal(h.submitted.length,1);assert.equal(h.providerPolls,polls);
  const message=Message.decode(h.submitted[0]);assert.equal(message.data?.type,2);assert.equal(message.data?.fid,545039);
  assert.equal('0x'+bytesToHex(message.signer),active.session?.key);
  assert.equal('0x'+bytesToHex(message.data!.castRemoveBody!.targetHash),own.hash);
  assert.ok((await validations.validateMessage(message)).isOk());
  h.failPost(true);await assert.rejects(account.deleteCast(own),/Node unavailable/);
  assert.equal(h.submitted.length,1);assert.equal(account.snapshot().session?.fid,545039);
});
test('replacement preparation signs without submitting, preserves all embeds and validates stored messages',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();
  const {castSdk}=await import('../src/lib/cast-sdk'),sdk=await castSdk();
  const original={...target,data:{...target.data,fid:545039,timestamp:sdk.getFarcasterTime()._unsafeUnwrap()}};
  const embeds=[{url:'https://external.example/image'},{castId:{fid:37,hash:target.hash}}];
  const input={text:'Replacement',mentions:[],mentionsPositions:[],images:[],links:[],embeds,parentUrl:'https://channel.example/topic'};
  await assert.rejects(account.prepareReplacement(target,input),/own casts/);
  const prepared=await account.prepareReplacement(original,input);assert.equal(h.submitted.length,0);assert.ok(prepared.cast.data.timestamp>original.data.timestamp);
  const validated=await account.validatePreparedCast(prepared);assert.deepEqual(validated.data.castAddBody.embeds,embeds);assert.equal(validated.data.castAddBody.parentUrl,input.parentUrl);
  await assert.rejects(account.validatePreparedCast({...prepared,bytes:'0x00'}));assert.equal(h.submitted.length,0);
  const receipt=await account.submitPreparedCast(prepared);assert.equal(receipt.hash,prepared.cast.hash);assert.equal(h.submitted.length,1);
  const long=await account.prepareReplacement(original,{...input,text:'x'.repeat(1025)});
  assert.equal(long.cast.data.castAddBody.text.length,1025);assert.equal(h.submitted.length,1);
  assert.equal((await account.validatePreparedCast(long)).data.castAddBody.text.length,1025);
});

test('notification enrollment signs a dedicated claim for the active account without exposing its key',async()=>{
  const h=harness(),account=h.create();await account.restore();await assert.rejects(account.enrollNotifications(),/Sign in/);
  await account.begin();h.approve();await account.check();const before=h.providerPolls;await account.enrollNotifications();
  assert.equal(h.providerPolls,before);assert.equal((h.claims.at(-1) as {fid:number}).fid,545039);
});

test('push registration binds the token, installation and enabled state to the device key, survives restore and unregisters before sign-out',async()=>{
  const h=harness(),account=h.create();await account.restore();await assert.rejects(account.setPush({installationId:'a'.repeat(32),token:'ExpoPushToken[fixture_token_123]',enabled:true}),/Sign in/);
  await account.begin();h.approve();await account.check();
  const registration={installationId:'a'.repeat(32),token:'ExpoPushToken[fixture_token_123]',enabled:true};
  await account.setPush(registration);assert.equal(account.snapshot().pushEnabled,true);
  const restarted=h.create();assert.equal((await restarted.restore()).pushEnabled,true);assert.deepEqual(await restarted.getPush(),registration);
  await restarted.signOut();assert.equal(h.saved,null);
  assert.equal((h.claims.at(-1) as {registration:{enabled:boolean}}).registration.enabled,false);
});
test('failed push enable retains a registration that can be revoked and offline sign-out keeps the key for retry',async()=>{
  const h=harness(),account=h.create();await account.restore();await account.begin();h.approve();await account.check();h.failPost(true);
  await assert.rejects(account.setPush({installationId:'a'.repeat(32),token:'ExpoPushToken[fixture_token_123]',enabled:true}),/Push gateway/);
  assert.equal(account.snapshot().pushEnabled,false);
  await assert.rejects(account.signOut(),/Push gateway/);assert.ok(h.saved);assert.ok(account.snapshot().session);
  h.failPost(false);await account.signOut();assert.equal(h.saved,null);
});
