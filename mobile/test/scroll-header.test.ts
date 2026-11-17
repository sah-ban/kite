import test from 'node:test';
import assert from 'node:assert/strict';
import {initialScrollHeader,scrollHeader} from '../src/lib/scroll-header';

test('Home header hides on downward scrolling and returns on upward scrolling away from the top',()=>{
  let state=scrollHeader(initialScrollHeader,40);assert.equal(state.hidden,false);
  state=scrollHeader(state,130);assert.equal(state.hidden,true);
  state=scrollHeader(state,127);assert.equal(state.hidden,true);
  state=scrollHeader(state,118);assert.equal(state.hidden,false);assert.equal(state.offset,118);
});
test('small direction changes do not flicker the header and returning to the top always reveals it',()=>{
  let state=scrollHeader(initialScrollHeader,100);
  for(const y of [99,100,98,100]){state=scrollHeader(state,y);assert.equal(state.hidden,true);}
  assert.equal(scrollHeader(state,0).hidden,false);assert.deepEqual(scrollHeader(state,-30),initialScrollHeader);
  assert.equal(scrollHeader(state,NaN),state);
});
test('a header with Home feed tabs hides and returns as one taller unit',()=>{
  let state=scrollHeader(initialScrollHeader,80,100);assert.equal(state.hidden,false);
  state=scrollHeader(state,120,100);assert.equal(state.hidden,true);
  state=scrollHeader(state,108,100);assert.equal(state.hidden,false);
  assert.equal(scrollHeader(state,0,100).hidden,false);
});
