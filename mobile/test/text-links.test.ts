import test from 'node:test';
import assert from 'node:assert/strict';
import {castTextLinkParts,textLinkParts} from '../src/lib/text-links';

test('bio links support HTTP, HTTPS, www and bare domains without changing text',()=>{
  const text='Build at neynar.com/slack\nAlso www.example.com and https://example.org?q=one#two. 🌱';
  const parts=textLinkParts(text);assert.equal(parts.map(p=>p.text).join(''),text);
  assert.deepEqual(parts.filter(p=>p.url).map(p=>p.url),['https://neynar.com/slack','https://www.example.com/','https://example.org/?q=one#two']);
});
test('link boundaries retain balanced URL punctuation and leave surrounding punctuation as text',()=>{
  const text='(https://example.com/wiki/Hello_(world)). example.org!';
  const parts=textLinkParts(text);assert.equal(parts.map(p=>p.text).join(''),text);assert.deepEqual(parts.filter(p=>p.url).map(p=>p.text),['https://example.com/wiki/Hello_(world)','example.org']);
});
test('unsupported schemes, credentials and email fragments remain ordinary bio text',()=>{
  for(const text of ['javascript:alert(1)','javascript:https://example.com','ftp://example.com','me@example.com','first.last@example.com','https://user:pass@example.com','<script>hello</script>'])assert.equal(textLinkParts(text).some(p=>p.url),false);
});

test('cast links preserve UTF-8 mention positions, emoji and surrounding punctuation',()=>{
  const text='🌱  See https://example.org/wiki/Hello_(world). Also example.com!',parts=castTextLinkParts(text,[37],[5]);
  assert.equal(parts.map(part=>part.text||'').join(''),text);
  assert.deepEqual(parts.filter(part=>part.fid),[{fid:37}]);
  assert.equal(parts[0].text,'🌱 ');assert.equal(parts[1].fid,37);
  assert.deepEqual(parts.filter(part=>part.url).map(part=>part.url),['https://example.org/wiki/Hello_(world)','https://example.com/']);
});
test('shortened casts retain the full link destination and mentions at the display boundary',()=>{
  const url='https://example.org/a/long/path?hello=world',text=`Read ${url}`,parts=castTextLinkParts(text,[],[],25);
  assert.equal(parts.map(part=>part.text||'').join(''),Array.from(text).slice(0,25).join('')+'…');
  assert.equal(parts.find(part=>part.url)?.url,url);
  assert.deepEqual(castTextLinkParts('🌱 hi',[37,42],[5,7],2),[{text:'🌱 '},{fid:37},{text:'…'}]);
  assert.deepEqual(castTextLinkParts('',[37],[0]),[{fid:37}]);
});
