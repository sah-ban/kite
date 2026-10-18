import assert from 'node:assert/strict';
import {test} from 'node:test';
import {castTextParts} from '../src/lib/mentions';

test('restores mentions at UTF-8 byte positions, including emoji and accented text',()=>{
  assert.deepEqual(castTextParts('🤓  says café ',[1,37],[5,17]).parts,[{text:'🤓 '},{fid:1},{text:' says café '},{fid:37}]);
});
test('preserves beginning, end, mention-only casts, and same-position order',()=>{
  assert.deepEqual(castTextParts(' hi ',[1,2,3],[0,4,4]).parts,[{fid:1},{text:' hi '},{fid:2},{fid:3}]);
  assert.deepEqual(castTextParts('',[37],[0]).parts,[{fid:37}]);
});
test('invalid metadata never corrupts or drops cast text',()=>{
  assert.deepEqual(castTextParts('🤓 hi',[1,2,-1,4,5],[1,999,0,-1,NaN]).parts,[{text:'🤓 hi'}]);
  assert.deepEqual(castTextParts('hello',[1],[]).parts,[{text:'hello'}]);
  assert.deepEqual(castTextParts('hello').parts,[{text:'hello'}]);
});
test('preview limits preserve whole Unicode characters and omit later mentions',()=>{
  assert.deepEqual(castTextParts('🤓 abc',[1,2],[5,8],2),{parts:[{text:'🤓 '},{fid:1},{text:'…'}],truncated:true});
  assert.equal(castTextParts('🤓 ab',[1],[5],4).truncated,false);
});
