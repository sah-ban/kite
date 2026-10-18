import test from 'node:test';
import assert from 'node:assert/strict';
import { Message, MessageData, validations, SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN, SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_TYPES } from '@farcaster/core';
import { bytesToHex, recoverTypedDataAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Shared server middleware is JavaScript.
import { approval, loadApprovalIdentity } from '../approval.mjs';

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
function harness(extra:Record<string,string>={}) {
  let time=Date.now(),state='pending_approval',approvedFid=123;
  const calls:{url:string;body?:unknown}[]=[];
  const verified:{fid:number;key:string}[]=[];
  const submitted:Message[]=[];
  const middleware=approval({...config,...extra},{
    now:()=>time,
    verify:async(fid:number,key:string)=>{verified.push({fid,key});return custody;},
    fetch:async(input:string|URL,init?:RequestInit)=>{
      const url=String(input);calls.push({url,body:init?.body});
      if(url.endsWith('/signed-key-requests'))return Response.json({result:{signedKeyRequest:{token:'0xdeadbeef',deeplinkUrl:'farcaster://signed-key-request?token=0xdeadbeef'}}});
      if(url.includes('/signed-key-request?'))return Response.json({result:{signedKeyRequest:{state,userFid:approvedFid}}});
      if(url==='https://submit.example/v1/submitMessage'){
        submitted.push(Message.decode(init!.body as Uint8Array));return Response.json({accepted:true});
      }
      throw new Error('Unexpected network request: '+url);
    },
  });
  return {middleware,calls,verified,submitted,approve:(fid=123)=>{state='completed';approvedFid=fid;time+=2000;},advance:(ms:number)=>{time+=ms;}};
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
  h.advance(9*60*60_000);
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
