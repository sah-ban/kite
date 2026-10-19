import test from 'node:test';
import assert from 'node:assert/strict';
import { filterByClient, type Filters } from '../src/lib/feed-filters';
import type { Cast } from '../src/lib/hub';
const cast = (fid: number, signer: string, hash: string) => ({hash,signer,data:{fid}} as Cast);
const casts = [cast(100,'0xAA','warpcast'),cast(200,'0xBB','firefly'),cast(300,'0xCC','self'),cast(400,'0xCC','other-author'),cast(500,'0xDD','unknown')];
const attribution = new Map([['0xaa',9152],['0xbb',16823],['0xcc',300]]);
const defaults: Filters = {mode:'include',clientFids:'',signerKeys:'',selfRegistered:false};
const names = (filters: Partial<Filters>) => filterByClient(casts,{...defaults,...filters},attribution).map(cast=>cast.hash);

test('named clients and additional client FIDs match signer registration, not the author',()=>{
  assert.deepEqual(names({clientFids:'9152,16823'}),['warpcast','firefly']);
  assert.deepEqual(names({clientFids:'300'}),['self','other-author']);
  assert.deepEqual(names({clientFids:'100'}),[]);
});
test('self-registered filtering compares each cast author to the client FID',()=>{
  assert.deepEqual(names({selfRegistered:true}),['self']);
  assert.deepEqual(names({mode:'exclude',selfRegistered:true}),['warpcast','firefly','other-author','unknown']);
});
test('client selections, self registration, and exact keys combine as alternatives',()=>{
  assert.deepEqual(names({clientFids:'16823',selfRegistered:true,signerKeys:'0xDd'}),['firefly','self','unknown']);
  assert.deepEqual(names({mode:'exclude',clientFids:'16823',selfRegistered:true,signerKeys:'0xDd'}),['warpcast','other-author']);
});
test('unknown attribution is hidden by include, retained by exclude, and explicit keys still match',()=>{
  assert.deepEqual(filterByClient(casts,{...defaults,selfRegistered:true},new Map()),[]);
  assert.equal(filterByClient(casts,{...defaults,mode:'exclude',clientFids:'9152'},new Map()).length,5);
  assert.deepEqual(names({mode:'all',clientFids:'9152'}),casts.map(c=>c.hash));
  assert.deepEqual(names({}),[]);
});
