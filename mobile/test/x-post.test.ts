import test from 'node:test';
import assert from 'node:assert/strict';
import {xPostLink,xPostTime} from '../src/lib/x-post';

test('X preview taps only open valid public post URLs',()=>{
  const id='463440424141459456';assert.equal(xPostLink(`https://twitter.com/Interior/status/${id}?s=20`),`https://x.com/Interior/status/${id}`);
  for(const value of ['javascript:alert(1)','https://x.com.evil.example/a/status/123','https://user:secret@x.com/a/status/123'])assert.equal(xPostLink(value),undefined);
  assert.equal(xPostTime(undefined),undefined);assert.equal(xPostTime('not a date'),undefined);assert.ok(xPostTime('2014-05-05T22:09:42.000Z')?.endsWith('y'));
});
