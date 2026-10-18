import test from 'node:test';
import assert from 'node:assert/strict';
import { Message, MessageData, validations, SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN, SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_TYPES } from '@farcaster/core';
import { bytesToHex, recoverTypedDataAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { mkdtemp, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Shared server middleware is JavaScript.
import { approval, loadApprovalIdentity } from '../approval.mjs';
// @ts-expect-error Server-only JavaScript storage module.
import {sessionStore,SessionStorageError} from '../session-store.mjs';

// Public deterministic development fixture. Never used for a live approval.
const mnemonic='test test test test test test test test test test test junk';
const custody='0x0000000000000000000000000000000000000001';
const config={FARCASTER_APP_FID:'1234',FARCASTER_APP_MNEMONIC:mnemonic,VALIDATOR_URL:'https://submit.example'};
type ResponseState={statusCode:number;headers:Record<string,string>;body:unknown;setHeader:(k:string,v:string)=>void;end:(value:unknown)=>void};

async function call(middleware:ReturnType<typeof approval>,path:string,options:{cookie?:string;body?:unknown;origin?:string;host?:string;ip?:string;method?:string}={}) {
  const req={url:path,method:options.method||(path==='/api/auth/session'?'GET':'POST'),headers:{host:options.host||'127.0.0.1:5173',origin:options.origin||'http://127.0.0.1:5173',cookie:options.cookie||''},socket:{remoteAddress:options.ip||'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(options.body||{}));}};
  const res:ResponseState={statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
  await middleware(req,res,()=>{throw new Error('Unexpected next middleware');});
  return {status:res.statusCode,headers:res.headers,body:JSON.parse(String(res.body))};
}
const memoryStore=()=>({load:async()=>new Map(),save:async()=>{},remove:async()=>{},has:async()=>true});
function harness(extra:Record<string,string>={}) {
  let time=Date.now(),state='pending_approval',approvedFid=123,verifyError:Error|undefined;
  const calls:{url:string;body?:unknown}[]=[];
  const verified:{fid:number;key:string}[]=[];
  const submitted:Message[]=[];
  const dependencies={
    ...(extra.FREECAST_SESSION_DIR?{}:{store:memoryStore()}),
    now:()=>time,
    verify:async(fid:number,key:string)=>{if(verifyError)throw verifyError;verified.push({fid,key});return custody;},
    fetch:async(input:string|URL,init?:RequestInit)=>{
      const url=String(input);calls.push({url,body:init?.body});
      if(url.endsWith('/signed-key-requests'))return Response.json({result:{signedKeyRequest:{token:'0xdeadbeef',deeplinkUrl:'farcaster://signed-key-request?token=0xdeadbeef'}}});
      if(url.includes('/signed-key-request?'))return Response.json({result:{signedKeyRequest:{state,userFid:approvedFid}}});
      if(url==='https://submit.example/v1/submitMessage'){
        submitted.push(Message.decode(init!.body as Uint8Array));return Response.json({accepted:true});
      }
      throw new Error('Unexpected network request: '+url);
    },
  };
  let middleware=approval({...config,...extra},dependencies);
  return {get middleware(){return middleware;},restart:()=>{middleware=approval({...config,...extra},dependencies);},failVerification:(error?:Error)=>{verifyError=error;},calls,verified,submitted,approve:(fid=123)=>{state='completed';approvedFid=fid;time+=2000;},advance:(ms:number)=>{time+=ms;}};
}
const cookieFrom=(result:Awaited<ReturnType<typeof call>>)=>result.headers['Set-Cookie'].split(';')[0];

test('approval creation signs public metadata and reuses a pending browser request',async()=>{
  const h=harness();
  const start=await call(h.middleware,'/api/auth/start');
  assert.equal(start.status,200);assert.equal(start.body.state,'pending');
  assert.ok(/^0x[0-9a-f]{64}$/.test(start.body.key));
  assert.ok(start.headers['Set-Cookie'].includes('HttpOnly'));
  assert.ok(start.headers['Set-Cookie'].includes('SameSite=Strict'));
  assert.ok(!JSON.stringify(start.body).includes('privateKey'));
  assert.ok(!JSON.stringify(start.body).includes(mnemonic));
  const request=JSON.parse(String(h.calls[0].body));
  assert.equal(request.requestFid,1234);
  assert.equal(request.key,start.body.key);
  const recovered=await recoverTypedDataAddress({domain:SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,types:SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_TYPES.types,primaryType:'SignedKeyRequest',message:{requestFid:1234n,key:request.key,deadline:BigInt(request.deadline)},signature:request.signature});
  assert.equal(recovered,mnemonicToAccount(mnemonic).address);
  const again=await call(h.middleware,'/api/auth/start',{cookie:cookieFrom(start)});
  assert.equal(again.body.key,start.body.key);assert.equal(h.calls.length,1);
  assert.equal(h.submitted.length,0,'creating approval must not post or auto-follow');
});

test('approved sessions are cookie-bound and sign only as the provider-approved FID',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  assert.equal((await call(h.middleware,'/api/auth/session')).body.state,'none');
  assert.equal((await call(h.middleware,'/api/auth/action',{body:{kind:'follow',targetFid:37}})).status,401);
  h.approve();
  const active=await call(h.middleware,'/api/auth/session',{cookie});
  assert.equal(active.body.state,'active');assert.equal(active.body.session.fid,123);
  assert.equal(active.body.session.key,start.body.key);assert.equal(active.body.session.remote,true);
  assert.deepEqual(h.verified,[{fid:123,key:start.body.key}]);
  assert.ok(!('privateKey' in active.body.session));assert.equal(h.submitted.length,0);
  const result=await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',fid:999,text:'Approval test fixture'}});
  assert.equal(result.status,200);assert.equal(h.submitted.length,1);
  const message=h.submitted[0];const data=MessageData.decode(message.dataBytes!);
  assert.equal(data.fid,123,'body must not select another signing FID');
  assert.equal(data.castAddBody?.text,'Approval test fixture');
  assert.equal(bytesToHex(message.signer),start.body.key);
  const validated=await validations.validateMessage({...message,data});
  assert.ok(validated.isOk());assert.equal(result.body.hash,bytesToHex(message.hash));
  await call(h.middleware,'/api/auth/logout',{cookie});
  assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.state,'none');
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'follow',targetFid:37}})).status,401);
});

test('logging out during registration verification cannot restore an active session',async()=>{
  let finishVerification!: (address:string)=>void;
  let verificationStarted!: ()=>void;
  const verifying = new Promise<void>(resolve=>{verificationStarted=resolve;});
  const middleware=approval(config,{
    store:memoryStore(),
    verify:()=>{verificationStarted();return new Promise<string>(resolve=>{finishVerification=resolve;});},
    fetch:async(input:string|URL)=>Response.json({result:{signedKeyRequest:String(input).endsWith('/signed-key-requests')
      ?{token:'fixture-token',deeplinkUrl:'farcaster://signed-key-request?token=fixture-token'}
      :{state:'completed',userFid:123}}}),
  });
  const start=await call(middleware,'/api/auth/start');const cookie=cookieFrom(start);
  const poll=call(middleware,'/api/auth/session',{cookie});
  await verifying;
  await call(middleware,'/api/auth/logout',{cookie});
  finishVerification(custody);
  const result=await poll;
  assert.equal(result.body.state,'none');
  assert.ok(!result.headers['Set-Cookie'],'a cancelled poll must not renew the session cookie');
  assert.equal((await call(middleware,'/api/auth/session',{cookie})).body.state,'none');
});

test('approval rejects cross-origin, public HTTP, and forged loopback requests',async()=>{
  const h=harness();
  assert.equal((await call(h.middleware,'/api/auth/start',{origin:'https://attacker.example'})).status,403);
  assert.equal((await call(h.middleware,'/api/auth/start',{host:'192.0.2.10:5173',origin:'http://192.0.2.10:5173',ip:'192.0.2.20'})).status,403);
  assert.equal((await call(h.middleware,'/api/auth/start',{ip:'192.0.2.20'})).status,403);
  assert.equal(h.calls.length,0);
});

test('HTTPS approval cookies are secure and still require the configured origin',async()=>{
  const h=harness({FREECAST_PUBLIC_URL:'https://client.example'});
  const started=await call(h.middleware,'/api/auth/start',{host:'client.example',origin:'https://client.example',ip:'192.0.2.20'});
  assert.equal(started.status,200);assert.ok(started.headers['Set-Cookie'].includes('; Secure'));
  assert.equal((await call(h.middleware,'/api/auth/start',{host:'client.example',origin:'https://attacker.example'})).status,403);
});

test('expired approvals and sessions stop authorizing actions',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  h.advance(11*60_000);
  assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.state,'none');
  const second=await call(h.middleware,'/api/auth/start');const approvedCookie=cookieFrom(second);h.approve();
  assert.equal((await call(h.middleware,'/api/auth/session',{cookie:approvedCookie})).body.state,'active');
  h.advance(31*24*60*60_000);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie:approvedCookie,body:{kind:'follow',targetFid:37}})).status,401);
});

test('unapproved requests and invalid actions cannot submit messages',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'no approval'}})).status,401);
  h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  for(const body of [{kind:'cast',text:'x'.repeat(1025)},{kind:'follow',targetFid:123},{kind:'reaction',reaction:'like',targetFid:37,targetHash:'0xshort'},{kind:'unknown'}])assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body})).status,400);
  assert.equal(h.submitted.length,0);
});

test('developer identity file reads only the requested identity fields',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-identity-test-'));
  try {
    const path=join(dir,'.env');
    await writeFile(path,`DEVELOPER_FID=1234\nDEVELOPER_MNEMONIC="${mnemonic}"\nNEXT_PUBLIC_HUBURL=https://unrelated.example\nDATABASE_URL=unrelated-test-value\n`);
    const settings={FARCASTER_APP_ENV_FILE:path,NEXT_PUBLIC_HUBURL:'https://own-node.example'};
    const identity=await loadApprovalIdentity(settings);
    assert.equal(identity.fid,1234);assert.equal(identity.account.address,mnemonicToAccount(mnemonic).address);
    assert.equal(settings.NEXT_PUBLIC_HUBURL,'https://own-node.example');
    assert.ok(!('DATABASE_URL' in settings));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('cast deletion signs a valid removal for the session owner and rejects other accounts',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  const hash='0x'+'ab'.repeat(20);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'deleteCast',targetFid:999,targetHash:hash}})).status,403);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'deleteCast',targetFid:123,targetHash:'0x123'}})).status,400);
  assert.equal(h.submitted.length,0);
  const deleted=await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'deleteCast',targetFid:123,targetHash:hash}});
  assert.equal(deleted.status,200);assert.equal(h.submitted.length,1);
  const message=h.submitted[0],data=MessageData.decode(message.dataBytes!);
  assert.equal(data.fid,123);assert.equal(data.type,2);assert.equal(bytesToHex(data.castRemoveBody!.targetHash),hash);
  assert.ok((await validations.validateMessage({...message,data})).isOk());
});

test('quotes encode a cast embed, allow optional commentary, and reject invalid targets',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  const quote={fid:37,hash:'0x'+'ab'.repeat(20)};
  for(const text of ['My thoughts','']){
    assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text,quote}})).status,200);
    const message=h.submitted.at(-1)!,data=MessageData.decode(message.dataBytes!);
    assert.equal(data.fid,123);assert.equal(data.castAddBody?.text,text);assert.equal(data.castAddBody?.parentCastId,undefined);
    const embed=data.castAddBody!.embeds[0].castId!;assert.equal(embed.fid,37);assert.equal(bytesToHex(embed.hash),quote.hash);
    assert.ok((await validations.validateMessage({...message,data})).isOk());
  }
  for(const invalid of [{fid:0,hash:quote.hash},{fid:37,hash:'0x123'}])assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'quote',quote:invalid}})).status,400);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:''}})).status,400);
  assert.equal(h.submitted.length,2);
});

test('mentions are signed as FIDs and UTF-8 positions for casts, replies, and quotes',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);
  h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  const target={fid:37,hash:'0x'+'ab'.repeat(20)};
  for(const context of [{},{parent:target},{quote:target}]){
    assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'🤓  hi',mentions:[37],mentionsPositions:[5],...context}})).status,200);
    const message=h.submitted.at(-1)!,data=MessageData.decode(message.dataBytes!);
    assert.deepEqual(data.castAddBody?.mentions,[37]);assert.deepEqual(data.castAddBody?.mentionsPositions,[5]);
    assert.ok((await validations.validateMessage({...message,data})).isOk());
  }
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',mentions:[37],mentionsPositions:[0]}})).status,200);
  for(const fields of [{mentions:[37],mentionsPositions:[]},{mentions:[0],mentionsPositions:[0]},{mentions:[37],mentionsPositions:[1]},{mentions:[37],mentionsPositions:[999]}]){
    assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'🤓 hi',...fields}})).status,400);
  }
  assert.equal(h.submitted.length,4);
});

test('pending and approved signer connections survive restarts with the same key and cookie',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-persistent-'));
  try{
    const h=harness({FREECAST_SESSION_DIR:dir}),start=await call(h.middleware,'/api/auth/start'),cookie=cookieFrom(start);
    h.restart();const pending=await call(h.middleware,'/api/auth/start',{cookie});
    assert.equal(pending.body.key,start.body.key);assert.equal(pending.body.deepLinkUrl,start.body.deepLinkUrl);
    assert.equal(h.calls.filter(call=>call.url.endsWith('/signed-key-requests')).length,1);
    h.approve();const approved=await call(h.middleware,'/api/auth/session',{cookie});assert.equal(approved.body.state,'active');
    assert.ok(approved.headers['Set-Cookie'].includes('Max-Age=2592000'));
    h.restart();const restored=await call(h.middleware,'/api/auth/session',{cookie});
    assert.equal(restored.body.state,'active');assert.equal(restored.body.session.key,start.body.key);assert.equal(restored.body.session.fid,123);
    assert.equal(h.verified.length,2,'revalidate a restored signer before exposing it as connected');
    await call(h.middleware,'/api/auth/session',{cookie});assert.equal(h.verified.length,2);
    assert.equal(h.submitted.length,0,'restoring a connection must not send messages');
    const action=await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'Persisted signer fixture'}});
    assert.equal(action.status,200);assert.equal(bytesToHex(h.submitted[0].signer),start.body.key);
    const message=h.submitted[0];assert.ok((await validations.validateMessage({...message,data:MessageData.decode(message.dataBytes!)})).isOk());
    await call(h.middleware,'/api/auth/logout',{cookie});h.restart();assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.state,'none');
    assert.equal((await readdir(dir)).filter(name=>name.endsWith('.json')).length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('saved sessions remain bound to their origin and transient verification failures do not erase them',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-persistent-'));
  try{
    const h=harness({FREECAST_SESSION_DIR:dir}),start=await call(h.middleware,'/api/auth/start'),cookie=cookieFrom(start);
    h.approve();await call(h.middleware,'/api/auth/session',{cookie});h.restart();
    h.failVerification(new Error('RPC unavailable'));
    assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).status,502);
    assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'must not send'}})).status,502);
    assert.equal(h.submitted.length,0);assert.equal((await readdir(dir)).filter(name=>name.endsWith('.json')).length,1);
    h.failVerification();assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.session.key,start.body.key);
    const other={cookie,host:'127.0.0.1:5174',origin:'http://127.0.0.1:5174'};
    assert.equal((await call(h.middleware,'/api/auth/session',other)).body.state,'none');
    await call(h.middleware,'/api/auth/logout',other);
    assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.state,'active','another origin cannot erase this connection');
    h.advance(31*24*60*60_000);h.restart();assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).body.state,'none');
    assert.equal((await readdir(dir)).filter(name=>name.endsWith('.json')).length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('corrupted saved signer storage returns an error without generating a replacement',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-persistent-'));
  try{
    const h=harness({FREECAST_SESSION_DIR:dir}),start=await call(h.middleware,'/api/auth/start'),cookie=cookieFrom(start);
    h.approve();await call(h.middleware,'/api/auth/session',{cookie});
    const path=join(dir,(await readdir(dir)).find(name=>name.endsWith('.json'))!);
    await writeFile(path,'invalid encrypted record',{mode:0o600});h.restart();
    assert.equal((await call(h.middleware,'/api/auth/session',{cookie})).status,503);
    assert.equal((await call(h.middleware,'/api/auth/start',{cookie})).status,503);
    assert.equal(h.calls.filter(call=>call.url.endsWith('/signed-key-requests')).length,1);assert.equal(h.submitted.length,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('approval is not active until its saved key is durable, and logout during saving cannot restore it',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-persistent-'));
  try{
    const disk=sessionStore(dir);let release!:()=>void,started!:()=>void;
    const saving=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
    const dependencies={store:{...disk,save:async(id:string,session:{state:string})=>{if(session.state==='active'){started();await gate;}await disk.save(id,session);}},verify:async()=>custody,fetch:async(input:string|URL)=>Response.json({result:{signedKeyRequest:String(input).endsWith('/signed-key-requests')?{token:'fixture-token',deeplinkUrl:'farcaster://signed-key-request?token=fixture-token'}:{state:'completed',userFid:123}}})};
    const middleware=approval(config,dependencies),start=await call(middleware,'/api/auth/start'),cookie=cookieFrom(start);
    const poll=call(middleware,'/api/auth/session',{cookie});await saving;
    assert.equal((await call(middleware,'/api/auth/session',{cookie})).body.state,'pending','do not report success while saving');
    await call(middleware,'/api/auth/logout',{cookie});release();
    assert.equal((await poll).body.state,'none');
    assert.equal((await sessionStore(dir).load()).size,0,'late saves cannot leave a signer after logout');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('a failed active-session save can be retried without generating another signer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-persistent-'));
  try{
    const disk=sessionStore(dir);let fail=true,time=Date.now(),starts=0;
    const middleware=approval(config,{now:()=>time,store:{...disk,save:async(id:string,session:{state:string})=>{if(session.state==='active'&&fail){fail=false;throw new SessionStorageError();}await disk.save(id,session);}},verify:async()=>custody,fetch:async(input:string|URL)=>{const start=String(input).endsWith('/signed-key-requests');if(start)starts++;return Response.json({result:{signedKeyRequest:start?{token:'fixture-token',deeplinkUrl:'farcaster://signed-key-request?token=fixture-token'}:{state:'completed',userFid:123}}});}});
    const start=await call(middleware,'/api/auth/start'),cookie=cookieFrom(start);
    assert.equal((await call(middleware,'/api/auth/session',{cookie})).status,503);
    assert.equal([...((await sessionStore(dir).load()).values())][0].state,'pending');
    time+=2000;const retried=await call(middleware,'/api/auth/session',{cookie});
    assert.equal(retried.body.state,'active');assert.equal(retried.body.session.key,start.body.key);assert.equal(starts,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('approved signer publishes image-only casts and quote images with valid signatures',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  const image='https://i.ibb.co/fixture/image.png';
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images:[image]}})).status,200);
  const first=h.submitted[0],data=MessageData.decode(first.dataBytes!);assert.equal(data.castAddBody?.text,'');assert.equal(data.castAddBody?.embeds[0].url,image);assert.ok((await validations.validateMessage({...first,data})).isOk());
  const quote={fid:37,hash:'0x'+'ab'.repeat(20)};
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images:[image],quote}})).status,200);
  assert.equal(MessageData.decode(h.submitted[1].dataBytes!).castAddBody?.embeds.length,2);
  for(const images of [[image,image,image],['https://evil.example/image.png']])assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images}})).status,400);
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images:[image,image],quote}})).status,400);
  assert.equal(h.submitted.length,2);
});

test('approved signer accepts direct Tenor GIF embeds and rejects other Tenor media',async()=>{
  const h=harness();const start=await call(h.middleware,'/api/auth/start');const cookie=cookieFrom(start);h.approve();await call(h.middleware,'/api/auth/session',{cookie});
  const gif='https://media.tenor.com/fixture/hello.gif';
  assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images:[gif]}})).status,200);
  const message=h.submitted[0],data=MessageData.decode(message.dataBytes!);assert.equal(data.castAddBody?.embeds[0].url,gif);assert.ok((await validations.validateMessage({...message,data})).isOk());
  for(const url of ['https://media.tenor.com/fixture/video.mp4','https://media.tenor.com.evil.example/a.gif'])assert.equal((await call(h.middleware,'/api/auth/action',{cookie,body:{kind:'cast',text:'',images:[url]}})).status,400);
  assert.equal(h.submitted.length,1);
});
