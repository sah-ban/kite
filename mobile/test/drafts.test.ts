import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKey,emptyDraft,makeDraftStore} from '../src/lib/composer';
import {listSavedDrafts,parseDraftKey,resolveDraftRouteKey} from '../src/lib/drafts';

const origin='https://kite.example',fid=37,ref={fid:42,hash:'0x'+'ab'.repeat(20)};
function memory(){
  const data=new Map<string,string>();
  return {data,getItem:async(key:string)=>data.get(key)??null,setItem:async(key:string,value:string)=>{data.set(key,value);},removeItem:async(key:string)=>{data.delete(key);},getAllKeys:async()=>[...data.keys()],multiGet:async(keys:string[])=>keys.map(key=>[key,data.get(key)??null] as const)};
}
test('saved draft keys preserve reply, quote and edit context and reject other accounts or servers',()=>{
  assert.deepEqual(parseDraftKey(draftKey(fid,origin),fid,origin),{});
  const key=draftKey(fid,origin,ref,ref)+':draft:unique-1';
  assert.deepEqual(parseDraftKey(key,fid,origin),{parent:ref,quote:ref});
  assert.equal(parseDraftKey(key,38,origin),undefined);
  assert.equal(parseDraftKey(key,fid,'https://another.example'),undefined);
  assert.equal(parseDraftKey(key+':unexpected',fid,origin),undefined);
  assert.equal(parseDraftKey(draftKey(fid,origin,{fid:0,hash:ref.hash}),fid,origin),undefined);
  assert.deepEqual(parseDraftKey(draftKey(fid,origin,ref)+`:edit:${ref.hash}`,fid,origin),{parent:ref,editHash:ref.hash});
});
test('draft list includes legacy and attachment-only drafts, excludes corrupt and foreign data, and sorts newest first',async()=>{
  const storage=memory(),base=draftKey(fid,origin);
  storage.data.set(base,JSON.stringify({...emptyDraft(),text:'Legacy draft'}));
  storage.data.set(base+':draft:new',JSON.stringify({...emptyDraft(),text:'Latest draft',updatedAt:200}));
  storage.data.set(draftKey(fid,origin,ref)+':draft:reply',JSON.stringify({...emptyDraft(),text:'Reply',updatedAt:100}));
  storage.data.set(draftKey(fid,origin,undefined,ref)+':draft:quote',JSON.stringify({...emptyDraft(),quote:ref,updatedAt:50}));
  storage.data.set(base+':draft:blank',JSON.stringify(emptyDraft()));
  storage.data.set(base+':draft:broken','{bad');
  storage.data.set(draftKey(99,origin),JSON.stringify({...emptyDraft(),text:'Other account'}));
  storage.data.set(draftKey(fid,'https://another.example'),JSON.stringify({...emptyDraft(),text:'Other server'}));
  const entries=await listSavedDrafts(storage,fid,origin);
  assert.deepEqual(entries.map(item=>item.draft.text),['Latest draft','Reply','','Legacy draft']);
  assert.deepEqual(entries[1].parent,ref);assert.deepEqual(entries[2].draft.quote,ref);
});
test('multiple drafts survive independently and discarded drafts stay removed after queued autosaves',async()=>{
  const storage=memory(),base=draftKey(fid,origin);
  const first=makeDraftStore(storage,base+':draft:one'),second=makeDraftStore(storage,base+':draft:two');
  const draft={...emptyDraft(),text:'First draft'};
  await Promise.all([first.save(draft),second.save({...draft,text:'Second draft'})]);
  assert.equal((await listSavedDrafts(storage,fid,origin)).length,2);
  const queued=first.save({...draft,text:'Latest change'}),discard=first.clear();
  await Promise.all([queued,discard]);await first.save(draft);
  assert.deepEqual((await listSavedDrafts(storage,fid,origin)).map(item=>item.draft.text),['Second draft']);
  await second.save(emptyDraft());assert.equal((await listSavedDrafts(storage,fid,origin)).length,0);
});
test('failed discards retain editable content and allow a later save or retry',async()=>{
  const storage=memory();let fail=true;
  const store=makeDraftStore({...storage,removeItem:async(key:string)=>{if(fail)throw new Error('Storage unavailable');await storage.removeItem(key);}},draftKey(fid,origin));
  await store.save({...emptyDraft(),text:'Keep me'});
  await assert.rejects(store.clear(),/Storage unavailable/);
  await store.save({...emptyDraft(),text:'Still editable'});
  assert.equal((await store.load()).text,'Still editable');
  fail=false;await store.clear();assert.equal(storage.data.size,0);
});

test('reopening a draft restores the exact storage key after router query decoding',async()=>{
  const storage=memory();
  for(const [parent,quote] of [[undefined,undefined],[ref,undefined],[undefined,ref],[ref,ref]] as const){
    const key=draftKey(fid,origin,parent,quote)+':draft:route-test';
    const draft={...emptyDraft(),text:'Resume this draft',...(quote?{quote}:{})};
    await makeDraftStore(storage,key).save(draft);
    // A query string is decoded by URL parsing, then by useLocalSearchParams in Expo Router.
    const href='/compose?'+new URLSearchParams({draftKey:key});
    const received=decodeURIComponent(new URL(href,'https://app.example').searchParams.get('draftKey')!);
    assert.equal(parseDraftKey(received,fid,origin),undefined);
    const resolved=resolveDraftRouteKey(received,fid,origin);
    assert.equal(resolved?.key,key);
    assert.deepEqual(resolved?.location,{...(parent?{parent}:{}),...(quote?{quote}:{})});
    assert.deepEqual(await makeDraftStore(storage,resolved!.key).load(),draft);
    assert.equal(resolveDraftRouteKey(key,fid,origin)?.key,key);
    assert.equal(resolveDraftRouteKey(received,99,origin),undefined);
    assert.equal(resolveDraftRouteKey(received,fid,'https://another.example'),undefined);
    assert.equal(resolveDraftRouteKey(received+':invalid',fid,origin),undefined);
  }
  assert.equal(resolveDraftRouteKey(['key'],fid,origin),undefined);
  assert.equal(resolveDraftRouteKey(null,fid,origin),undefined);
});
