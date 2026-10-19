import test from 'node:test';
import assert from 'node:assert/strict';
import { NobleEd25519Signer as LegacySigner } from '@farcaster/core';
import { bytesToHex } from 'viem';
import { restoreCastDraft, encodedEditDraft, prepareReplacement, publishReplacement, type ReplacementAttempt } from '../src/lib/cast-edit';
import { encodeMentionText } from '../src/lib/mentions';
import { loadGaslessSdk } from '../src/lib/gasless-sdk';
import type { Cast, Config } from '../src/lib/hub';
const localSigner=new LegacySigner(new Uint8Array(32).fill(7));
const sdk=await loadGaslessSdk(),signer=new sdk.NobleEd25519Signer(new Uint8Array(32).fill(7));
const config:Config={readUrl:'/api/read',validatorUrl:'/api/write',optimismRpcUrl:'https://rpc.example',useGateway:true};
const source=():Cast=>({hash:'0x'+'ab'.repeat(20),signer:'0x'+'11'.repeat(32),data:{fid:123,timestamp:Math.floor(Date.now()/1000)-1609459200,castAddBody:{text:'🤓  original',mentions:[37],mentionsPositions:[5],embeds:[{url:'https://example.com/photo.png'},{castId:{fid:77,hash:'0x'+'cd'.repeat(20)}}],parentUrl:'chain://channel'}}});
const session={fid:123,address:'0x0000000000000000000000000000000000000001' as const,key:bytesToHex((await signer.getSignerKey())._unsafeUnwrap()),remote:true as const};
const missing=()=>Response.json({error:'Failed to get cast',error_detail:'status: NotFound, message: "cast not found"'},{status:400});
Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
test('editing restores Unicode mentions and preserves all URL/quote embeds and reply/channel context',()=>{
  const cast=source(),draft=restoreCastDraft(cast,{37:'alice.eth'});
  assert.equal(draft.text,'🤓 @alice.eth original');assert.deepEqual(encodeMentionText(draft.text,draft.mentions),{text:cast.data.castAddBody.text,mentions:[37],mentionsPositions:[5]});
  assert.deepEqual(draft.embeds,cast.data.castAddBody.embeds);assert.equal(draft.parentUrl,'chain://channel');
  cast.data.castAddBody.parentUrl=undefined;cast.data.castAddBody.parentCastId={fid:88,hash:'0x'+'ef'.repeat(20)};cast.data.castAddBody.embedsDeprecated=['https://example.com/old'];
  const reply=restoreCastDraft(cast);assert.equal(reply.text,'🤓 @fid37 original');assert.deepEqual(reply.parentCastId,cast.data.castAddBody.parentCastId);assert.equal(reply.embeds.at(-1)?.url,'https://example.com/old');
  cast.data.castAddBody.mentionsPositions=[1];assert.throws(()=>restoreCastDraft(cast),/safely prefilled/);
});
test('preparation signs modern embeds without writing and creates a new hash for unchanged content',async()=>{
  const fetch=globalThis.fetch;let writes=0;globalThis.fetch=async()=>{writes++;return Response.json({});};
  try{
    const cast=source(),draft=restoreCastDraft(cast,{37:'alice.eth'});
    const prepared=await prepareReplacement(config,{...session,remote:false,signer:localSigner},cast,draft);assert.equal(writes,0);
    const message=sdk.Message.decode(prepared.bytes),data=sdk.MessageData.decode(message.dataBytes!);
    assert.deepEqual(data.castAddBody?.mentions,[37]);assert.equal(data.castAddBody?.embeds[0].url,'https://example.com/photo.png');assert.equal(data.castAddBody?.embeds[1].castId?.fid,77);assert.equal(data.castAddBody?.parentUrl,'chain://channel');assert.ok(data.timestamp>cast.data.timestamp);assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());
    const same={...cast,hash:prepared.hash,data:{...cast.data,timestamp:data.timestamp}};const again=await prepareReplacement(config,{...session,remote:false,signer:localSigner},same,draft);assert.notEqual(again.hash,prepared.hash);
  }finally{globalThis.fetch=fetch;}
});
test('ownership, mention, URL and Pro validation prevent preparation or deletion of an invalid replacement',async()=>{
  const fetch=globalThis.fetch;let writes=0;globalThis.fetch=async(_input,init)=>{if(init?.method==='POST')writes++;return Response.json({tier_subscriptions:[]});};
  try{
    const cast=source(),draft=restoreCastDraft(cast);
    await assert.rejects(prepareReplacement(config,{...session,fid:999},cast,draft),/own casts/);
    assert.throws(()=>encodedEditDraft({...draft,embeds:[{url:''}]}),/URLs/);
    await assert.rejects(prepareReplacement(config,session,cast,{...draft,embeds:[...draft.embeds,{url:'https://example.com/third'}]}),/active Farcaster Pro/);assert.equal(writes,0);
  }finally{globalThis.fetch=fetch;}
});
test('delete-confirm-post workflow keeps the same signed replacement after a failed submission and never deletes twice',async()=>{
  const fetch=globalThis.fetch,cast=source();let removed=false,published=false,fail=true,deletions=0;const submissions:Uint8Array[]=[];
  const body=encodedEditDraft(restoreCastDraft(cast));
  // @ts-expect-error Shared modern builder.
  const {buildReplacementMessage}=await import('../replacement.mjs');
  const signed=await buildReplacementMessage(body,{fid:123,hash:cast.hash,timestamp:cast.data.timestamp},123,signer);
  const bytes=sdk.Message.encode({...signed,data:undefined,dataBytes:sdk.MessageData.encode(signed.data!).finish()}).finish();
  const attempt:ReplacementAttempt={hash:bytesToHex(signed.hash),bytes,originalDeleted:false,deletionSubmitted:false,publicationStarted:false};
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith('/action')){assert.equal(JSON.parse(String(init?.body)).kind,'deleteCast');deletions++;removed=true;return Response.json({hash:'0x'+'12'.repeat(20)});}
    if(url.includes('/api/write/')){assert.equal(removed,true);submissions.push(new Uint8Array(init!.body as Uint8Array));if(fail)return Response.json({error:'Fixture failure'},{status:502});published=true;return Response.json({});}
    if(url.includes(cast.hash))return removed?missing():Response.json(cast);
    if(url.includes(attempt.hash))return published?Response.json({...cast,hash:attempt.hash}):missing();
    throw new Error('Unexpected read');
  };
  try{
    await assert.rejects(publishReplacement(config,session,cast,attempt),/Original cast deleted/);assert.equal(attempt.originalDeleted,true);assert.equal(deletions,1);assert.equal(submissions.length,1);
    fail=false;assert.equal(await publishReplacement(config,session,cast,attempt),attempt.hash);assert.equal(deletions,1);assert.equal(submissions.length,2);assert.deepEqual(submissions[0],submissions[1]);
    await publishReplacement(config,session,cast,attempt);assert.equal(submissions.length,2);
  }finally{globalThis.fetch=fetch;}
});
test('failed original deletion never submits the replacement',async()=>{
  const fetch=globalThis.fetch,cast=source();let replacements=0;
  globalThis.fetch=async(input)=>{if(String(input).endsWith('/action'))return Response.json({error:'Fixture delete failure'},{status:502});if(String(input).includes('/api/write/'))replacements++;return Response.json(cast);};
  const attempt:ReplacementAttempt={hash:'0x'+'cd'.repeat(20),bytes:new Uint8Array([1]),originalDeleted:false,deletionSubmitted:false,publicationStarted:false};
  try{await assert.rejects(publishReplacement(config,session,cast,attempt),/Fixture delete failure/);assert.equal(replacements,0);assert.equal(attempt.originalDeleted,false);}
  finally{globalThis.fetch=fetch;}
});
