import test from 'node:test';
import assert from 'node:assert/strict';
import {addImage,addLink,castInput,changeText,draftKey,draftLinks,emptyDraft,imageMime,makeDraftStore,removeLink,restoreDraft,usage} from '../src/lib/composer';
import {newCastBody} from '../../cast.mjs';

test('native drafts use the web mention encoding, automatic links and four-embed validation',()=>{
  const draft={...emptyDraft(),text:'Hi @kiteapp 🌱 https://example.com/a.',mentions:[{start:3,end:11,fid:925685,label:'@kiteapp'}]};
  const input=castInput(draft);assert.equal(input.text,'Hi  🌱 https://example.com/a.');assert.deepEqual(input.mentions,[925685]);assert.deepEqual(input.mentionsPositions,[3]);assert.deepEqual(input.links,['https://example.com/a']);assert.equal(newCastBody(input).embeds.length,1);
  const edited=changeText(draft,draft.text.replace('@kiteapp','@someone'));assert.deepEqual(edited.mentions,[]);
  let attachments=emptyDraft();for(let i=0;i<4;i++)attachments=addLink(attachments,`https://example.com/${i}`);
  assert.throws(()=>addLink(attachments,'https://example.com/5'),/Remove an embed/);assert.equal(castInput(attachments).links.length,4);
});
test('removing an automatic link suppresses it while keeping it in text',()=>{
  let draft={...emptyDraft(),text:'https://example.com/a https://example.com/b'};draft=removeLink(draft,'https://example.com/a');assert.deepEqual(draftLinks(draft).urls,['https://example.com/b']);assert.ok(draft.text.includes('/a'));
  draft=addLink(draft,'https://example.com/a');assert.deepEqual(new Set(draftLinks(draft).urls),new Set(['https://example.com/a','https://example.com/b']));
});
test('images, GIFs and links share the same embed budget and unsafe URLs cannot be attached',()=>{
  let draft=addImage(emptyDraft(),'https://i.ibb.co/a/image.png');draft=addImage(draft,'https://media.tenor.com/abc/reaction.gif');draft={...draft,text:'https://example.com/a https://example.com/b https://example.com/c'};
  assert.equal(draftLinks(draft).urls.length,2);assert.equal(draftLinks(draft).overflow,1);assert.equal(newCastBody(castInput(draft)).embeds.length,4);
  for(const value of ['javascript:alert(1)','https://user:pass@example.com','file:///tmp/file'])assert.throws(()=>addLink(emptyDraft(),value));
  assert.throws(()=>addImage(emptyDraft(),'https://evil.example/private.png'));
});
test('text limits count protocol UTF-8 bytes and replies keep a full parent reference',()=>{
  assert.equal(usage({...emptyDraft(),text:'🌱'.repeat(257)},10000).error,'');assert.equal(usage({...emptyDraft(),text:'🌱'.repeat(2500)},10000).error,'');assert.match(usage({...emptyDraft(),text:'🌱'.repeat(2501)},10000).error,/10,000/);
  const parent={fid:37,hash:'0x'+'22'.repeat(20)};assert.deepEqual(castInput({...emptyDraft(),text:'reply'},parent).parent,parent);assert.throws(()=>castInput(emptyDraft()),/Write some text/);
});
test('quotes use cast references, reserve an embed slot and allow quote-only posts',()=>{
  const quote={fid:37,hash:'0x'+'44'.repeat(20)};
  let draft={...emptyDraft(),quote};
  const body=newCastBody(castInput(draft));assert.deepEqual(body.embeds,[{castId:quote}]);assert.equal(body.parentCastId,undefined);
  assert.equal(usage(draft,10000).error,'');assert.equal(usage(draft,10000).embeds,1);
  draft=addImage(draft,'https://i.ibb.co/a/image.png') as typeof draft;
  draft={...draft,text:'https://example.com/1 https://example.com/2 https://example.com/3'};
  assert.equal(draftLinks(draft).urls.length,2);assert.equal(draftLinks(draft).overflow,1);assert.equal(newCastBody(castInput(draft)).embeds.length,4);
  assert.throws(()=>addImage(draft,'https://i.ibb.co/b/image.png'),/Remove an embed/);
  assert.throws(()=>addLink(draft,'https://example.com/4'),/Remove an embed/);
  assert.throws(()=>castInput({...draft,quote:{fid:37,hash:'0x123'}}),/Invalid quote/);
});
test('quote drafts are isolated and retain attachment removal after reopening',async()=>{
  const quote={fid:37,hash:'0x'+'44'.repeat(20)},initial={...emptyDraft(),quote};
  const data=new Map<string,string>(),storage={getItem:async(key:string)=>data.get(key)??null,setItem:async(key:string,value:string)=>{data.set(key,value);},removeItem:async(key:string)=>{data.delete(key);}};
  const key=draftKey(545039,'https://kite.example',undefined,quote);
  assert.notEqual(key,draftKey(545039,'https://kite.example'));assert.notEqual(key,draftKey(545039,'https://kite.example',quote));
  const store=makeDraftStore(storage,key,initial);assert.deepEqual(await store.load(),initial);
  await store.save({...initial,text:'My comment'});assert.deepEqual((await makeDraftStore(storage,key,initial).load()).quote,quote);
  await store.save({...emptyDraft(),text:'Removed quote'});assert.equal((await makeDraftStore(storage,key,initial).load()).quote,undefined);
  await store.clear();assert.deepEqual(await store.load(),emptyDraft());
});
test('draft persistence is account/context scoped, serialized and cannot restore a successfully cleared draft',async()=>{
  const data=new Map<string,string>();const storage={getItem:async(key:string)=>data.get(key)||null,setItem:async(key:string,value:string)=>{await new Promise(resolve=>setTimeout(resolve,2));data.set(key,value);},removeItem:async(key:string)=>{data.delete(key);}};
  const key=draftKey(545039,'https://kite.example'),store=makeDraftStore(storage,key),draft={...emptyDraft(),text:'Keep this draft'};
  await store.save(draft);assert.deepEqual(await store.load(),draft);assert.notEqual(key,draftKey(37,'https://kite.example'));assert.notEqual(key,draftKey(545039,'https://kite.example',{fid:37,hash:'0x'+'22'.repeat(20)}));
  const save=store.save({...draft,text:'latest edit'}),clear=store.clear();await Promise.all([save,clear]);await store.save(draft);assert.equal(data.has(key),false);assert.deepEqual(restoreDraft('{bad json'),emptyDraft());
});
test('image uploads validate content rather than filename extensions',()=>{
  assert.equal(imageMime(Uint8Array.from([255,216,255,1])),'image/jpeg');assert.equal(imageMime(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');assert.equal(imageMime(new TextEncoder().encode('GIF89atest')),'image/gif');assert.throws(()=>imageMime(new TextEncoder().encode('<svg>')));
});
