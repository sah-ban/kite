import test from 'node:test';
import assert from 'node:assert/strict';
import {reactionCount,reactionKey} from '../src/lib/reaction-feedback';
import type {Cast} from '../src/lib/hub';
import type {Reaction} from '../src/lib/social';
const item=(fid:number)=>({data:{fid}} as Reaction);
test('optimistic reaction counts change once and do not double count when server data catches up',()=>{
  const add={active:true,pending:true},remove={active:false,pending:false};
  assert.equal(reactionCount({items:[item(1)],next:''},123,add),'2');
  assert.equal(reactionCount({items:[item(1),item(123)],next:''},123,add),'2');
  assert.equal(reactionCount({items:[item(1),item(123)],next:'more'},123,remove),'1+');
  assert.equal(reactionCount({items:[item(1)],next:''},123,remove),'1');
  assert.equal(reactionCount(undefined,123,add),'—');
  assert.equal(reactionCount({items:[],next:''},123,remove),'0');
});
test('reaction feedback is scoped to the connected account, target and reaction kind',()=>{
  const cast={hash:'0xABCD',data:{fid:37}} as Cast;
  assert.equal(reactionKey(123,cast,'like'),reactionKey(123,{...cast,hash:'0xabcd'},'like'));
  assert.notEqual(reactionKey(123,cast,'like'),reactionKey(124,cast,'like'));
  assert.notEqual(reactionKey(123,cast,'like'),reactionKey(123,cast,'recast'));
});
