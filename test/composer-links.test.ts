import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser/server helpers.
import { linkURL, linkEmbeds, textLinks, resolveLinks } from '../link-embeds.mjs';

test('detects and deduplicates text links without swallowing punctuation or balanced URL parentheses',()=>{
  assert.deepEqual(textLinks('See (https://example.com/a_(b)), https://other.example/path?x=1&y=2! https://example.com/a_(b).'),['https://example.com/a_(b)','https://other.example/path?x=1&y=2']);
  assert.deepEqual(textLinks('https://EXAMPLE.com https://example.com/ http://example.org'),['https://example.com/','http://example.org/']);
  assert.deepEqual(textLinks("[https://example.com/path.)] 'https://other.example' `https://third.example`"),['https://example.com/path','https://other.example/','https://third.example/']);
  assert.deepEqual(textLinks('javascript:alert(1) ftp://example.com https://user:pass@example.com https://example.com/'+ 'a'.repeat(300)),[]);
});
test('removing a preview suppresses it while preserving the text and other links',()=>{
  const text='https://a.example https://b.example';
  assert.deepEqual(resolveLinks(text,[],[],['https://a.example/'],2),{urls:['https://b.example/'],overflow:0});
  assert.deepEqual(resolveLinks(text+' more typing',[],[],['https://a.example/'],2).urls,['https://b.example/']);
  assert.equal(text,'https://a.example https://b.example');
  assert.deepEqual(resolveLinks('unrelated text',[],[],[],2).urls,[]);
});
test('manual links take priority, existing images and quotes reserve slots, and duplicate embeds are skipped',()=>{
  assert.deepEqual(resolveLinks('https://a.example https://b.example',['https://manual.example/'],[],[],2),{urls:['https://manual.example/','https://a.example/'],overflow:1});
  assert.deepEqual(resolveLinks('https://a.example https://b.example',[],['https://a.example'],[],1),{urls:['https://b.example/'],overflow:0});
  assert.deepEqual(resolveLinks('https://a.example',[],[],[],0),{urls:[],overflow:1});
  assert.deepEqual(resolveLinks('https://a.example',[],[],[],-2),{urls:[],overflow:1});
  assert.deepEqual(resolveLinks('https://a.example',['https://a.example/'],[],[],1),{urls:['https://a.example/'],overflow:0});
});
test('link submission validation enforces shared slots, protocols and the UTF-8 URL limit',()=>{
  assert.deepEqual(linkEmbeds(['https://example.com','http://example.org/path'],2),[{url:'https://example.com/'},{url:'http://example.org/path'}]);
  for(const url of ['javascript:alert(1)','ftp://example.com','https://user:secret@example.com','https://example.com/'+ 'a'.repeat(240),null])assert.throws(()=>linkURL(url));
  assert.throws(()=>linkEmbeds(['https://example.com'],0));assert.throws(()=>linkEmbeds('https://example.com',2));
});
