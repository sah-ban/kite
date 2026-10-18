import assert from 'node:assert/strict';
import {test} from 'node:test';
import {castTextParts,editMentions,encodeMentionText,mentionQuery} from '../src/lib/mentions';

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

test('draft mentions encode FIDs at UTF-8 offsets without username text',()=>{
  const text='🤓 @alice says hi @bob.eth!';
  const encoded=encodeMentionText(text,[{start:18,end:26,fid:2,label:'@bob.eth'},{start:3,end:9,fid:1,label:'@alice'}]);
  assert.deepEqual(encoded,{text:'🤓  says hi !',mentions:[1,2],mentionsPositions:[5,14]});
  assert.deepEqual(encodeMentionText('@alice',[{start:0,end:6,fid:1,label:'@alice'}]),{text:'',mentions:[1],mentionsPositions:[0]});
});
test('draft mention edits shift intact mentions and remove edited or extended usernames',()=>{
  const mention={start:3,end:9,fid:1,label:'@alice'};
  assert.deepEqual(editMentions('Hi @alice!','Hello @alice!',[mention]),[{...mention,start:6,end:12}]);
  assert.deepEqual(editMentions('Hi @alice!','Hi @alicia!',[mention]),[]);
  assert.deepEqual(editMentions('Hi @alice!','Hi @alices!',[mention]),[]);
  assert.deepEqual(editMentions('Hi @alice!','Hi @alice. ',[mention]),[mention]);
  assert.deepEqual(editMentions('Hi @alice!','Hi @alice.eth!',[mention]),[]);
});
test('mention queries support ENS and cursor edits without matching emails or URLs',()=>{
  assert.deepEqual(mentionQuery('Hi @alice.eth',13),{start:3,end:13,query:'alice.eth'});
  assert.deepEqual(mentionQuery('Hi @alice',6),{start:3,end:9,query:'al'});
  assert.equal(mentionQuery('mail@example.com',16),undefined);
  assert.equal(mentionQuery('https://example.org/@alice',25),undefined);
  assert.deepEqual(mentionQuery('@',1),{start:0,end:1,query:''});
});
test('stale, overlapping, and excessive mention ranges cannot be signed',()=>{
  assert.throws(()=>encodeMentionText('@alice',[{start:0,end:6,fid:1,label:'@bob'}]),/changed/);
  assert.throws(()=>encodeMentionText('@alice',[{start:0,end:6,fid:0,label:'@alice'}]),/changed/);
  assert.throws(()=>encodeMentionText('@alice',Array.from({length:11},()=>({start:0,end:6,fid:1,label:'@alice'}))),/10 accounts/);
});
