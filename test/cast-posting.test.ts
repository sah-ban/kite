import test from 'node:test';
import assert from 'node:assert/strict';
import { NobleEd25519Signer } from '@farcaster/core';
import { bytesToHex } from 'viem';
import { postCast } from '../src/lib/signing';
import { loadGaslessSdk } from '../src/lib/gasless-sdk';
import { composerUsage } from '../src/lib/cast-limits';
import type { Cast,Config } from '../src/lib/hub';

const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7)),config:Config={readUrl:'/api/read',optimismRpcUrl:'https://rpc.example',useGateway:true};
const session={fid:123,address:'0x0000000000000000000000000000000000000001' as const,key:bytesToHex((await signer.getSignerKey())._unsafeUnwrap()),signer};
const target={hash:'0x'+'ab'.repeat(20),signer:session.key,data:{fid:37,timestamp:1,castAddBody:{text:'Original',mentions:[],mentionsPositions:[],embeds:[]}}} satisfies Cast;
Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});

test('local signing publishes valid 10k casts, four-embed replies and three-embed quotes with the modern builder',async()=>{
  const sdk=await loadGaslessSdk(),original=globalThis.fetch,messages:import('@farcaster/core-gasless').Message[]=[];
  globalThis.fetch=async(input,init)=>{
    if(String(input).includes('storageLimitsByFid'))return Response.json({tier_subscriptions:[{tier_type:'Pro',expires_at:Date.now()/1000+86400}]});
    if(String(input).includes('submitMessage')){messages.push(sdk.Message.decode(init!.body as Uint8Array));return Response.json({});}
    throw new Error('Unexpected request');
  };
  try{
    const images=['https://i.ibb.co/fixture/photo.png','https://media.tenor.com/fixture/hello.gif'],links=['https://example.com/one','https://example.com/two'];
    await postCast(config,session,'😀'.repeat(2500),undefined,undefined,[],images,links);
    await postCast(config,session,'Reply',target,undefined,[],images,links);
    await postCast(config,session,'Quote',undefined,target,[],images,links.slice(0,1));
    for(const message of messages){const data=sdk.MessageData.decode(message.dataBytes!);assert.equal(data.fid,123);assert.equal(data.castAddBody?.embeds.length,4);assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());}
    assert.equal(sdk.MessageData.decode(messages[0].dataBytes!).castAddBody?.type,sdk.CastType.TEN_K_CAST);
    assert.equal(sdk.MessageData.decode(messages[1].dataBytes!).castAddBody?.parentCastId?.fid,37);
    assert.equal(sdk.MessageData.decode(messages[2].dataBytes!).castAddBody?.embeds.at(-1)?.castId?.fid,37);
  }finally{globalThis.fetch=original;}
});
test('casts, replies and quotes finish on submission success without confirmation reads for local and approved accounts',async()=>{
  const original=globalThis.fetch;
  try{
    for(const remote of [false,true])for(const kind of ['cast','reply','quote']){
      const castSession=remote?{...session,remote:true as const}:session,calls:string[]=[];
      let release!:(response:Response)=>void,started!:()=>void,expected='0x'+'cd'.repeat(20),settled=false;
      const response=new Promise<Response>(resolve=>{release=resolve;}),sending=new Promise<void>(resolve=>{started=resolve;});
      globalThis.fetch=async(input,init)=>{
        calls.push(String(input));assert.equal(init?.method,'POST','No confirmation GET should be sent.');
        assert.equal(String(input),remote?'/api/auth/action':'/api/write/v1/submitMessage');
        if(!remote){const sdk=await loadGaslessSdk();expected=bytesToHex(sdk.Message.decode(init!.body as Uint8Array).hash);}
        started();return response;
      };
      const posting=postCast(config,castSession,'Fixture',kind==='reply'?target:undefined,kind==='quote'?target:undefined).then(hash=>{settled=true;return hash;});
      await sending;assert.equal(settled,false,'Publishing must wait for the submission response.');
      release(Response.json({hash:expected}));assert.equal(await posting,expected);assert.equal(calls.length,1);
      globalThis.fetch=async()=>Response.json({error:'Fixture rejected'},{status:400});
      await assert.rejects(postCast(config,castSession,'Rejected'),remote?/Fixture rejected/:/Node returned 400/);
    }
  }finally{globalThis.fetch=original;}
});
test('posting checks current Pro status and never submits over-limit or expired drafts',async()=>{
  const original=globalThis.fetch;let writes=0,pro:unknown={tier_subscriptions:[]};
  globalThis.fetch=async input=>{if(String(input).includes('storageLimitsByFid'))return Response.json(pro);writes++;return Response.json({});};
  try{
    for(pro of [{tier_subscriptions:[]},{tierSubscriptions:[{tierType:1,expiresAt:1}]},{}]){
      await assert.rejects(postCast(config,session,'x'.repeat(1025)),/Pro/);
      await assert.rejects(postCast(config,session,'Links',undefined,undefined,[],[],['https://a.example','https://b.example','https://c.example']),/Pro/);
    }
    pro={tierSubscriptions:[{tierType:1,expiresAt:Date.now()/1000+86400}]};
    await assert.rejects(postCast(config,session,'😀'.repeat(2500)+'x'),/10,000/);
    await assert.rejects(postCast(config,session,'Five',undefined,undefined,[],[],Array(5).fill('https://example.com')),/up to 4/);
    assert.equal(writes,0);
  }finally{globalThis.fetch=original;}
});
test('composer byte counts exclude mention labels and enforce UTF-8 and total embed limits without truncation',()=>{
  const regular={maxBytes:1024,maxEmbeds:2},pro={maxBytes:10000,maxEmbeds:4};
  assert.deepEqual(composerUsage('😀'.repeat(256),[],2,regular),{bytes:1024,error:''});assert.match(composerUsage('😀'.repeat(257),[],0,regular).error,/1,024/);
  assert.deepEqual(composerUsage('😀'.repeat(2500),[],4,pro),{bytes:10000,error:''});assert.match(composerUsage('😀'.repeat(2500)+'x',[],0,pro).error,/10,000/);
  assert.match(composerUsage('Valid',[],5,pro).error,/Remove 1 embed/);
  const text='x'.repeat(1020)+' @alice',mentions=[{fid:37,label:'@alice',start:1021,end:1027}];assert.deepEqual(composerUsage(text,mentions,0,regular),{bytes:1021,error:''});
});
