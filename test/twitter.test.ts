import test from 'node:test';
import assert from 'node:assert/strict';
import { twitterIntent } from '../src/lib/twitter';
import type { Cast } from '../src/lib/hub';

const cast=(text:string,embeds:Cast['data']['castAddBody']['embeds']=[]):Cast=>({hash:'0x'+'ab'.repeat(20),signer:'0x'+'11'.repeat(32),data:{fid:123,timestamp:1,castAddBody:{text,mentions:[],mentionsPositions:[],embeds}}});
const draft=(value:Cast,names:Record<number,string>={})=>new URL(twitterIntent(value,names)).searchParams.get('text');

test('Twitter intent preserves full Unicode text, newlines and reserved characters',()=>{
  const text='Hello 🤓 & #friends + 100%?\n'+ 'Long cast '.repeat(100),url=new URL(twitterIntent(cast(text)));
  assert.equal(url.origin,'https://twitter.com');assert.equal(url.pathname,'/intent/tweet');assert.equal(url.searchParams.get('text'),text);assert.deepEqual([...url.searchParams.keys()],['text']);
});
test('Twitter draft appends unique link, media, legacy and quoted-cast URLs',()=>{
  const quote={fid:37,hash:'0x'+'cd'.repeat(20)},value=cast('Cast text',[{url:'https://example.com/article?a=1&b=2'},{url:'https://example.com/image.png'},{url:'https://example.com/video.mp4'},{url:'https://example.com/image.png'},{castId:quote}]);
  value.data.castAddBody.embedsDeprecated=['https://legacy.example/path','https://example.com/image.png'];
  assert.equal(draft(value),'Cast text\n\nhttps://example.com/article?a=1&b=2\n\nhttps://example.com/image.png\n\nhttps://example.com/video.mp4\n\nhttps://farcaster.xyz/37/'+quote.hash+'\n\nhttps://legacy.example/path');
  assert.equal(draft(cast('',[{url:'https://example.com/image.png'}])),'https://example.com/image.png');
});
test('Twitter draft retains links already in text without duplicating their embeds and omits unsafe URLs',()=>{
  assert.equal(draft(cast('Read https://EXAMPLE.com/path.',[{url:'https://example.com/path'},{url:'javascript:alert(1)'},{url:'https://user:secret@example.com'},{url:'https://other.example'}])),'Read https://EXAMPLE.com/path.\n\nhttps://other.example/');
});
test('Twitter draft restores Farcaster mentions at UTF-8 positions with FID fallbacks',()=>{
  const value=cast('🤓  hello ');value.data.castAddBody.mentions=[37,88];value.data.castAddBody.mentionsPositions=[5,12];
  assert.equal(draft(value,{37:'alice.eth'}),'🤓 @alice.eth hello @FID88');
});
