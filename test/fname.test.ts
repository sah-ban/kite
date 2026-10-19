import test from 'node:test';
import assert from 'node:assert/strict';
import { mnemonicToAccount } from 'viem/accounts';
import { bytesToHex, hexToBytes } from 'viem';
import { eip712, makeUserNameProofClaim, NobleEd25519Signer, Message, MessageData, validations } from '@farcaster/core';
import { inspectFnameChange, fnameCheckError, prepareFnameChange } from '../src/lib/fname';
import { setPreferredFname } from '../src/lib/signing';
import type { Config } from '../src/lib/hub';
// @ts-expect-error Shared registry policy.
import { FNAME_COOLDOWN, claimableFname, ownsFnameProof } from '../fname-utils.mjs';

// Public deterministic fixture; never used for a live registry request.
const phrase='test test test test test test test test test test test junk',account=mnemonicToAccount(phrase),fid=123,now=2_000_000_000;
const config:Config={readUrl:'/api/read',validatorUrl:'/api/write',optimismRpcUrl:'https://rpc.example',useGateway:true};
const session={fid,address:account.address,key:'0x11' as const,remote:true as const};
Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
async function environment(run:(env:ReturnType<typeof state>)=>Promise<void>){
  const original=globalThis.fetch,env=state();globalThis.fetch=env.fetch;
  try{await run(env);}finally{globalThis.fetch=original;(window.location as {hostname:string}).hostname='localhost';}
}
function state(){
  const env={name:'oldfname' as string|null,preferred:'oldfname',time:now,oldTimestamp:now-FNAME_COOLDOWN-100,target:[] as any[],posts:[] as any[],reads:[] as string[],failRelease:false,failClaim:false,ambiguousRelease:false,proofFid:fid,selects:[] as string[],custody:account.address as `0x${string}`,failSelect:false,
    dependencies:{custody:async()=>env.custody,pause:async()=>{},selectPreferred:async(name:string)=>{env.selects.push(name);if(env.failSelect)throw new Error('Fixture profile failure');env.preferred=name;}},
    fetch:async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
      const url=new URL(String(input),'https://client.example'),entry=(name:string,to:number,timestamp:number,id=1)=>({id,username:name,from:to?0:fid,to,owner:account.address,timestamp});
      if(url.origin==='https://fnames.farcaster.xyz'){
        if(init?.method==='POST'){
          const payload=JSON.parse(String(init.body));env.posts.push(payload);assert.ok(!String(init.body).includes(phrase));
          if(payload.to===0){if(env.failRelease)return Response.json({code:'THROTTLED'},{status:400});env.name=null;if(env.ambiguousRelease){env.ambiguousRelease=false;throw new TypeError('Fixture connection lost');}}
          else{if(env.failClaim)return Response.json({error:'Fixture unavailable'},{status:503});env.name=payload.name;env.target=[entry(payload.name,fid,payload.timestamp,2)];}
          return Response.json({transfer:{...entry(payload.name,payload.to,payload.timestamp,2),from:payload.from}});
        }
        env.reads.push(url.href);
        if(url.pathname==='/current-time')return Response.json({currentTime:env.time});
        if(url.pathname==='/transfers/current')return env.name?Response.json({transfer:entry(env.name,fid,env.name==='oldfname'?env.oldTimestamp:env.target.at(-1)?.timestamp||now,env.name==='oldfname'?1:2)}):Response.json({error:'No current name'},{status:404});
        if(url.pathname==='/transfers')return Response.json({transfers:env.target.filter(item=>item.id>Number(url.searchParams.get('from_id')||0))});
      }
      if(url.pathname.endsWith('/userNameProofByName'))return Response.json({fid:env.proofFid,type:'USERNAME_TYPE_FNAME',name:'newfname'});
      if(url.pathname.endsWith('/userDataByFid'))return Response.json({messages:[{data:{userDataBody:{type:6,value:env.preferred}}}]});
      throw new Error('Unexpected request '+url.pathname);
    },
  };return env;
}
const prepare=(env:ReturnType<typeof state>)=>prepareFnameChange(config,session,'newfname',phrase,0,undefined,env.dependencies);

test('availability and both 28-day cooldowns are checked before custody preparation or writes',async()=>environment(async env=>{
  let check=await inspectFnameChange(fid,'newfname');assert.equal(check.available,true);assert.equal(fnameCheckError(check),'');
  env.oldTimestamp=now-100;check=await inspectFnameChange(fid,'newfname');assert.match(fnameCheckError(check),/28-day cooldown/);await assert.rejects(prepare(env),/cooldown/);
  env.oldTimestamp=now-FNAME_COOLDOWN-100;env.target=[{id:1,username:'newfname',from:999,to:0,owner:account.address,timestamp:now-100}];check=await inspectFnameChange(fid,'newfname');assert.equal(check.available,true);assert.match(fnameCheckError(check),/cooldown/);await assert.rejects(prepare(env),/cooldown/);
  env.target[0].to=999;check=await inspectFnameChange(fid,'newfname');assert.equal(check.available,false);await assert.rejects(prepare(env),/taken/);assert.equal(env.posts.length,0);
  for(const name of ['bad.name','-bad','x'.repeat(17),'warpcast','www'])assert.throws(()=>claimableFname(name));
}));
test('prepare is read-only; confirmation signs valid custody proofs, releases then claims, and sets the preferred username',async()=>environment(async env=>{
  const pending=await prepare(env);assert.equal(env.posts.length,0);assert.equal(pending.review.owner,account.address);assert.equal(pending.stage,'ready');
  assert.equal(await pending.run(()=>{}),'newfname');assert.equal(pending.stage,'complete');assert.equal(env.posts.length,2);assert.deepEqual(env.posts.map(payload=>[payload.name,payload.from,payload.to]),[['oldfname',fid,0],['newfname',0,fid]]);assert.ok(env.posts[1].timestamp>env.posts[0].timestamp);assert.deepEqual(env.selects,['newfname']);
  for(const payload of env.posts){const valid=await eip712.verifyUserNameProofClaim(makeUserNameProofClaim(payload),hexToBytes(payload.signature),hexToBytes(account.address));assert.ok(valid.isOk()&&valid.value);}
  await pending.run(()=>{});assert.equal(env.posts.length,2,'Completing twice must not re-release a name.');
}));
test('custody mismatch, changed availability and changed custody block every registry write',async()=>environment(async env=>{
  env.custody='0x0000000000000000000000000000000000000001';await assert.rejects(prepare(env),/custody address/);env.custody=account.address;
  const pending=await prepare(env);env.target=[{id:1,username:'newfname',from:0,to:999,owner:account.address,timestamp:now-FNAME_COOLDOWN-100}];await assert.rejects(pending.run(()=>{}),/taken/);assert.equal(env.posts.length,0);
  env.target=[];env.custody='0x0000000000000000000000000000000000000001';await assert.rejects(pending.run(()=>{}),/custody owner changed/);assert.equal(env.posts.length,0);pending.discard();await assert.rejects(pending.run(()=>{}),/phrase again/);
}));
test('failed release never claims; failed or ambiguous submissions resume from registry state without repeating release',async()=>environment(async env=>{
  let pending=await prepare(env);env.failRelease=true;await assert.rejects(pending.run(()=>{}),/cooldown/);assert.equal(env.posts.length,1);assert.equal(env.posts[0].to,0);assert.equal(env.name,'oldfname');pending.discard();env.posts=[];env.failRelease=false;
  pending=await prepare(env);env.failClaim=true;await assert.rejects(pending.run(()=>{}),/previous fname was released/);assert.equal(env.name,null);assert.equal(env.posts.length,2);env.failClaim=false;await pending.run(()=>{});assert.equal(env.posts.filter(payload=>payload.to===0).length,1);assert.equal(env.posts.filter(payload=>payload.to===fid).length,2);
  env.name='oldfname';env.preferred='oldfname';env.target=[];env.posts=[];pending=await prepare(env);env.ambiguousRelease=true;await assert.rejects(pending.run(()=>{}),/unconfirmed/);assert.equal(env.name,null);await pending.run(()=>{});assert.equal(env.posts.filter(payload=>payload.to===0).length,1);assert.equal(env.posts.length,2);
}));
test('claimed names can finish after node lag or profile-write failure without more registry transfers',async()=>environment(async env=>{
  const pending=await prepare(env);env.proofFid=999;await assert.rejects(pending.run(()=>{}),/new fname is claimed/);assert.equal(env.posts.length,2);assert.equal(env.selects.length,0);
  env.proofFid=fid;env.failSelect=true;await assert.rejects(pending.run(()=>{}),/Fixture profile failure/);assert.equal(env.posts.length,2);env.failSelect=false;await pending.run(()=>{});assert.equal(env.posts.length,2);assert.equal(env.preferred,'newfname');
  const resume=await prepare(env);assert.equal(resume.review.alreadyOwned,true);await resume.run(()=>{});assert.equal(env.posts.length,2);
}));
test('hostname guards reject hosted use and proof checks require the exact owning FID, fname and proof type',async()=>environment(async env=>{
  (window.location as {hostname:string}).hostname='client.example';await assert.rejects(prepare(env),/localhost/);await assert.rejects(inspectFnameChange(fid,'newfname'),/localhost/);assert.equal(env.reads.length,0);assert.equal(env.posts.length,0);
  assert.equal(ownsFnameProof({fid,type:1,name:'newfname'},'newfname',fid),true);assert.equal(ownsFnameProof({fid,type:'USERNAME_TYPE_FNAME',name:Buffer.from('newfname').toString('base64')},'newfname',fid),true);
  for(const proof of [{fid:999,type:1,name:'newfname'},{fid,type:2,name:'newfname'},{fid,type:1,name:'different'}])assert.equal(ownsFnameProof(proof,'newfname',fid),false);
}));
test('local preferred-username signing checks ownership and produces a valid USER_DATA_ADD message',async()=>{
  const original=globalThis.fetch,signer=new NobleEd25519Signer(new Uint8Array(32).fill(7)),local={fid,address:account.address,key:bytesToHex((await signer.getSignerKey())._unsafeUnwrap()),signer};let proofFid=999;const messages:Message[]=[];
  globalThis.fetch=async(input,init)=>{if(String(input).includes('userNameProofByName'))return Response.json({fid:proofFid,name:'newfname',type:1});messages.push(Message.decode(init!.body as Uint8Array));return Response.json({});};
  try{await assert.rejects(setPreferredFname(config,local,'newfname'),/belongs to your FID/);assert.equal(messages.length,0);proofFid=fid;await setPreferredFname(config,local,'newfname');const envelope=messages[0],data=MessageData.decode(envelope.dataBytes!);assert.equal(data.fid,fid);assert.equal(data.userDataBody?.type,6);assert.equal(data.userDataBody?.value,'newfname');assert.ok((await validations.validateMessage({...envelope,data})).isOk());}
  finally{globalThis.fetch=original;}
});
