import test from 'node:test';
import assert from 'node:assert/strict';
import {ed25519} from '@noble/curves/ed25519';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils';
import {Message,validations} from '@farcaster/core';
import {createAccount,type AccountStorage} from '../src/lib/account-core';
import {mobileClaim} from '../../mobile-proof.mjs';

const origin='https://kite.example',address='0x'+'11'.repeat(20),now=1700000000000;
const target={hash:'0x'+'22'.repeat(20),signer:'public',data:{fid:37,timestamp:1,castAddBody:{text:'Fixture'}}};
function harness(){
  let saved:string|null=null,counter=1,approved=false,failSave=false,failPost=false;
  let seedCount=0,approvalCalls=0,providerPolls=0;
  const submitted:Uint8Array[]=[],claims:unknown[]=[];
  const storage:AccountStorage={get:async()=>saved,set:async(value)=>{if(failSave)throw Error('Storage unavailable');saved=value;},remove:async()=>{saved=null;}};
  const api={origin,accountPost:async<T>(purpose:'approval'|'verify',body:unknown):Promise<T>=>{
    const claim=body as {key:string;signature:string;issuedAt:number;nonce:string;fid?:number};claims.push(body);
    assert.ok(!('privateKey' in claim));assert.ok(saved,'key must be saved before the approval request');
    assert.ok(ed25519.verify(hexToBytes(claim.signature.slice(2)),mobileClaim(origin,purpose==='approval'?'approve':'verify',claim.key,claim.issuedAt,claim.nonce,claim.fid||0),hexToBytes(claim.key.slice(2))));
    if(purpose==='approval'){approvalCalls++;return {key:claim.key,token:'fixture-token',deepLinkUrl:'farcaster://signed-key-request?token=fixture-token',appFid:925685,expiresAt:now+900000} as T;}
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
