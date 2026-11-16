import test from 'node:test';
import assert from 'node:assert/strict';
import {ed25519} from '@noble/curves/ed25519';
import {bytesToHex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
// @ts-expect-error Server-only JavaScript middleware.
import {mobileApproval} from '../mobile-approval.mjs';
// @ts-expect-error Shared JavaScript public proof.
import {pushClaim} from '../push-proof.mjs';
// @ts-expect-error Shared JavaScript public proof.
import {mobileClaim} from '../mobile-proof.mjs';
// @ts-expect-error Shared registration state error.
import {RegistrationPending} from '../approval.mjs';

// Public deterministic fixture, never a live account.
const secret=new Uint8Array(32).fill(42),key=bytesToHex(ed25519.getPublicKey(secret));
const origin='https://kite.example',time=1700000000000;
function proof(purpose='approve',fid=0,nonce='ab'.repeat(16)){
  const issuedAt=Math.floor(time/1000);
  return {key,issuedAt,nonce,signature:bytesToHex(ed25519.sign(mobileClaim(origin,purpose,key,issuedAt,nonce,fid),secret)),...(purpose!=='approve'?{fid}:{})};
}
async function call(middleware:ReturnType<typeof mobileApproval>,path='/api/mobile/approval',body:unknown=proof(),headers:Record<string,string>={},method='POST'){
  const req={url:path,method,headers:{host:'kite.example',...headers},socket:{remoteAddress:'192.0.2.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}};
  const result={statusCode:200,headers:{} as Record<string,string>,body:'',setHeader(key:string,value:string){this.headers[key]=value;},end(value:string){this.body=value;}};
  await middleware(req,result,()=>{throw Error('Unexpected next');});return {status:result.statusCode,headers:result.headers,body:JSON.parse(result.body)};
}
function harness(){
  const created:Record<string,unknown>[]=[],verified:{fid:number;key:string}[]=[];
  let verification:Error|undefined;
  const middleware=mobileApproval({KITE_PUBLIC_URL:origin},{now:()=>time,identity:async()=>({fid:1234,account:mnemonicToAccount('test test test test test test test test test test test junk')}),check:async(fid:number,key:string)=>{if(verification)throw verification;verified.push({fid,key});return '0x'+'11'.repeat(20);},fetcher:async(input:string,init:RequestInit)=>{
    assert.equal(input,'https://api.farcaster.xyz/v2/signed-key-requests');created.push(JSON.parse(String(init.body)));
    return Response.json({result:{signedKeyRequest:{token:'fixture-token',deeplinkUrl:'farcaster://signed-key-request?token=fixture-token'}}});
  }});
  return {middleware,created,verified,failVerification:(error:Error)=>{verification=error;}};
}
test('mobile approval proves device key ownership and returns only public approval data without cookies',async()=>{
  const h=harness();const result=await call(h.middleware);
  assert.equal(result.status,200);assert.equal(result.body.key,key);assert.equal(result.body.appFid,1234);assert.equal(result.body.token,'fixture-token');assert.equal(h.created.length,1);
  assert.equal(h.created[0].key,key);assert.equal(h.created[0].requestFid,1234);assert.ok(!('privateKey' in h.created[0]));assert.ok(!('privateKey' in result.body));assert.equal(result.headers['Set-Cookie'],undefined);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.deepEqual((await call(h.middleware)).body,result.body);assert.equal(h.created.length,1,'retrying the same proof must reuse one provider request');
});
test('invalid signatures, stale claims, injected secrets and cross-origin requests cannot create approvals',async()=>{
  const h=harness();
  for(const body of [{...proof(),signature:'0x'+'00'.repeat(64)},{...proof(),issuedAt:1},{...proof(),key:'0x'+'11'.repeat(32)},{...proof(),privateKey:'must-never-be-accepted'}])assert.ok([400,403].includes((await call(h.middleware,undefined,body)).status));
  assert.equal((await call(h.middleware,undefined,proof(),{origin:'https://attacker.example'})).status,403);
  assert.equal((await call(h.middleware,undefined,proof(),{host:'attacker.example'})).status,403);
  assert.equal((await call(h.middleware,undefined,proof(),{},'GET')).status,405);assert.equal(h.created.length,0);
});
test('mobile verification binds the approved FID to the device-owned public key',async()=>{
  const h=harness();const result=await call(h.middleware,'/api/mobile/verify',proof('verify',37));
  assert.equal(result.status,200);assert.deepEqual(h.verified,[{fid:37,key}]);assert.equal(result.body.fid,37);assert.equal(result.body.key,key);assert.equal(result.body.state,'active');
  assert.equal((await call(h.middleware,'/api/mobile/verify',{...proof('verify',37),fid:38})).status,403);assert.equal(h.verified.length,1);
  h.failVerification(new RegistrationPending());assert.deepEqual((await call(h.middleware,'/api/mobile/verify',proof('verify',37))).body,{state:'pending'});
});
test('mobile errors do not expose server credentials or internal network diagnostics',async()=>{
  const middleware=mobileApproval({KITE_PUBLIC_URL:origin},{now:()=>time,identity:async()=>{throw new Error('private server credential');}});
  const result=await call(middleware);assert.equal(result.status,503);assert.ok(!JSON.stringify(result.body).includes('private'));
  const h=harness();h.failVerification(new Error('https://private-node.example with secret-token'));const verify=await call(h.middleware,'/api/mobile/verify',proof('verify',37));assert.equal(verify.status,503);assert.ok(!JSON.stringify(verify.body).includes('private-node'));assert.ok(!JSON.stringify(verify.body).includes('secret-token'));
});

test('mobile notification enrollment requires a dedicated signed claim and verified registration',async()=>{
  const enrolled:number[]=[];
  let registered=true;
  const middleware=mobileApproval({KITE_PUBLIC_URL:origin},{now:()=>time,check:async()=>{if(!registered)throw new RegistrationPending();return '0x'+'11'.repeat(20);},enrollFeed:async(fid:number)=>{enrolled.push(fid);return {enrolled:true,fid};}});
  assert.equal((await call(middleware,'/api/mobile/feed',proof('verify',37))).status,403);
  assert.equal((await call(middleware,'/api/mobile/feed',{...proof('feed',37),fid:38})).status,403);
  assert.equal((await call(middleware,'/api/mobile/feed',proof('feed',37))).status,200);
  assert.deepEqual(enrolled,[37]);
  registered=false;await call(middleware,'/api/mobile/feed',proof('feed',38));assert.deepEqual(enrolled,[37]);
});

test('push registration authenticates every token field and permits revoked keys to disable only their own registration',async()=>{
 const requests:any[]=[];let registered=true;
 const registration={installationId:'a'.repeat(32),token:'ExpoPushToken[fixture_token_123]',enabled:true};
 const signed=(value=registration)=>{const base=proof('push',37);return {...base,registration:value,signature:bytesToHex(ed25519.sign(pushClaim(origin,key,base.issuedAt,base.nonce,37,value),secret))};};
 const middleware=mobileApproval({KITE_PUBLIC_URL:origin},{now:()=>time,check:async()=>{if(!registered)throw Object.assign(Error('inactive'),{status:403});return '0x'+'11'.repeat(20);},enrollFeed:async()=>({enrolled:true,fid:37}),registerPush:async(fid:number,signer:string,value:unknown)=>{requests.push({fid,signer,value});return {registered:(value as any).enabled,fid};}});
 assert.equal((await call(middleware,'/api/mobile/push',signed())).status,200);assert.equal(requests.length,1);
 for(const changed of [{...registration,token:'ExpoPushToken[other_token_123]'}, {...registration,enabled:false}, {...registration,installationId:'b'.repeat(32)}])assert.equal((await call(middleware,'/api/mobile/push',{...signed(),registration:changed})).status,403);
 assert.equal((await call(middleware,'/api/mobile/push',signed({...registration,token:'https://attacker.example'}))).status,400);
 registered=false;assert.equal((await call(middleware,'/api/mobile/push',signed())).status,403);
 assert.equal((await call(middleware,'/api/mobile/push',signed({...registration,enabled:false}))).status,200);
 assert.equal(requests.at(-1).value.enabled,false);
});
