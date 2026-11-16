import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreEditDraft,runCastEdit,readEditAttempt,editKey} from '../src/lib/cast-edit';
import {castBody,castInput,restoreDraft,draftLinks,usage,addImage,makeDraftStore,emptyDraft} from '../src/lib/composer';
import type {Cast} from '../src/lib/model';

const source:Cast={hash:'0x'+'22'.repeat(20),signer:'0x'+'11'.repeat(32),data:{fid:545039,timestamp:1,castAddBody:{text:'Hi  🌱',mentions:[37],mentionsPositions:[3],parentUrl:'https://channel.example/topic',embeds:[{url:'https://external.example/opaque-image'},{url:'https://example.com/article'},{castId:{fid:37,hash:'0x'+'33'.repeat(20)}},{castId:{fid:88,hash:'0x'+'44'.repeat(20)}}]}}};
const session={fid:source.data.fid,key:source.signer,address:'0x'+'55'.repeat(20)};
test('edit drafts round-trip mentions, every embed and channel context without duplicating body links',()=>{
  const draft=restoreEditDraft(source,{37:'alice'}),input=castInput(draft),body=castBody(input);
  assert.equal(draft.text,'Hi @alice 🌱');assert.deepEqual(body.embeds,source.data.castAddBody.embeds);assert.equal(body.text,source.data.castAddBody.text);assert.deepEqual(body.mentions,[37]);assert.deepEqual(body.mentionsPositions,[3]);assert.equal(body.parentUrl,source.data.castAddBody.parentUrl);
  assert.equal(usage(draft,10000).embeds,4);assert.throws(()=>addImage(draft,'https://i.ibb.co/x/image.png'),/Remove an embed/);
  assert.deepEqual(restoreDraft(JSON.stringify(draft)),draft);
  const linked={...draft,text:draft.text+' https://example.com/article'};assert.deepEqual(draftLinks(linked).urls,[]);
  const reply={...source,data:{...source.data,castAddBody:{...source.data.castAddBody,parentUrl:undefined,parentCastId:{fid:37,hash:source.hash}}}};
  assert.deepEqual(castBody(castInput(restoreEditDraft(reply),reply.data.castAddBody.parentCastId)).parentCastId,reply.data.castAddBody.parentCastId);
  assert.throws(()=>restoreEditDraft({...source,data:{...source.data,castAddBody:{...source.data.castAddBody,mentionsPositions:[5]}}}),/cannot be safely prefilled/);
  const mediaOnly={...source,data:{...source.data,castAddBody:{text:'',embeds:[{url:'https://external.example/image'}]}}};
  const mediaBody=castBody(castInput(restoreEditDraft(mediaOnly)));assert.equal(mediaBody.text,'');assert.deepEqual(mediaBody.embeds,mediaOnly.data.castAddBody.embeds);
});
function harness(){
  const data=new Map<string,string>(),events:string[]=[],prepared={bytes:'0xab',cast:{...source,hash:'0x'+'66'.repeat(20),data:{...source.data,timestamp:2}}};
  const storage={getItem:async(key:string)=>data.get(key)??null,setItem:async(key:string,value:string)=>{events.push('save');data.set(key,value);}};
  let failSubmit=true;
  const options={source,input:castInput(restoreEditDraft(source)),session,origin:'https://kite.example',storage,prepare:async()=>{events.push('prepare');return prepared;},validate:async()=>{events.push('validate');return prepared.cast;},remove:async()=>{events.push('delete');},submit:async(value:typeof prepared)=>{events.push('submit:'+value.bytes);if(failSubmit)throw Error('timeout');return value.cast;},onDeleted:()=>{events.push('deleted');},onProgress:()=>{},onPrepared:()=>{events.push('frozen');}};
  return {options,data,events,prepared,accept:()=>{failSubmit=false;}};
}
test('replacement retries reuse saved bytes, skip accepted deletion and never duplicate an accepted publication',async()=>{
  const h=harness();await assert.rejects(runCastEdit(h.options),/signed draft is saved/);
  assert.ok(h.events.indexOf('save')<h.events.indexOf('delete'));assert.ok(h.events.indexOf('delete')<h.events.indexOf('submit:0xab'));
  const key=editKey(h.options.origin,session.fid,source.hash),saved=await readEditAttempt(h.options.storage,key,session,source.hash);assert.equal(saved?.deleted,true);assert.equal(saved?.accepted,false);
  h.accept();const changedInput={...h.options.input,text:'Must not replace already signed content'};
  const result=await runCastEdit({...h.options,input:changedInput});assert.equal(result.hash,h.prepared.cast.hash);
  assert.equal(h.events.filter(e=>e==='prepare').length,1);assert.equal(h.events.filter(e=>e==='delete').length,1);assert.equal(h.events.filter(e=>e==='submit:0xab').length,2);
  await runCastEdit(h.options);assert.equal(h.events.filter(e=>e==='submit:0xab').length,2);
});
test('ownership, preparation, validation and initial persistence errors stop before deletion',async()=>{
  for(const failure of ['owner','prepare','validate','save'] as const){
    const h=harness(),options={...h.options};
    if(failure==='owner')options.session={...session,fid:37};
    if(failure==='prepare')options.prepare=async()=>{throw Error('Cannot sign');};
    if(failure==='validate')options.validate=async()=>{throw Error('Invalid signature');};
    if(failure==='save')options.storage={...options.storage,setItem:async()=>{throw Error('Storage unavailable');}};
    await assert.rejects(runCastEdit(options));assert.ok(!h.events.includes('delete'));assert.ok(!h.events.some(e=>e.startsWith('submit:')));
  }
});
test('a failed deletion retains the prepared draft and does not publish',async()=>{
  const h=harness();await assert.rejects(runCastEdit({...h.options,remove:async()=>{throw Error('Deletion unavailable');}}),/Deletion unavailable/);
  assert.ok(!h.events.some(e=>e.startsWith('submit:')));const key=editKey(h.options.origin,session.fid,source.hash);
  assert.equal((await readEditAttempt(h.options.storage,key,session,source.hash))?.deleted,false);
});
test('resuming a signed edit uses its exact content instead of an older auto-saved draft',async()=>{
  const initial=restoreEditDraft(source),old={...emptyDraft(),text:'Older text'};
  const store=makeDraftStore({getItem:async()=>JSON.stringify(old),setItem:async()=>{},removeItem:async()=>{}},'edit-draft',initial);
  assert.equal((await store.load()).text,'Older text');assert.deepEqual(await store.load(true),initial);
});
