import test from 'node:test';
import assert from 'node:assert/strict';
import {filterChips,removeFilter,type Filters} from '../src/lib/feed-filters';
const key='0x'+'aB'.repeat(32),filters:Filters={mode:'exclude',clientFids:'9152, 16823, 9152, 123',signerKeys:`${key}, ${key.toLowerCase()}`,selfRegistered:true};
test('filter chips deduplicate clients and keys, name known clients and preserve include/exclude behavior',()=>{
  assert.deepEqual(filterChips(filters).map(chip=>chip.label),['Warpcast','Firefly','Client 123','Self-registered',`App key ${key.toLowerCase().slice(0,8)}…abab`]);
  assert.deepEqual(filterChips({...filters,mode:'all'}),[]);
  const removed=removeFilter(filters,'client:9152');assert.equal(removed.mode,'exclude');assert.equal(removed.clientFids,'16823, 123');assert.equal(filters.clientFids,'9152, 16823, 9152, 123');
  assert.equal(removeFilter(filters,`key:${key.toLowerCase()}`).signerKeys,'');
});
test('removing the last active filter restores all clients instead of leaving an empty include feed',()=>{
  for(const mode of ['include','exclude'] as const){
    assert.equal(removeFilter({mode,clientFids:'9152',signerKeys:'',selfRegistered:false},'client:9152').mode,'all');
    assert.equal(removeFilter({mode,clientFids:'',signerKeys:'',selfRegistered:true},'self').mode,'all');
    assert.equal(removeFilter({mode,clientFids:'',signerKeys:key,selfRegistered:false},`key:${key.toLowerCase()}`).mode,'all');
  }
});
