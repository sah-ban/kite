import test from 'node:test';
import assert from 'node:assert/strict';
import { twitterIntent } from '../src/lib/twitter';
import type { Cast } from '../src/lib/hub';
import { profile, invalidateProfile, type Config } from '../src/lib/hub';
import { xHandle } from '../src/lib/x-handle';

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
test('Twitter draft restores mentions using linked X handles at UTF-8 positions with profile link fallbacks',()=>{
  const value=cast('🤓  hello ');value.data.castAddBody.mentions=[37,88];value.data.castAddBody.mentionsPositions=[5,12];
  assert.equal(draft(value,{37:'alice_on_x'}),'🤓 @alice_on_x hello https://farcaster.xyz/88');
  assert.equal(draft(value,{37:'alice.eth',88:'not a handle'}),'🤓 https://farcaster.xyz/37 hello https://farcaster.xyz/88');
});

test('X handles accept platform username characters and never treat URLs or Farcaster ENS names as X usernames',()=>{
  assert.equal(xHandle('Alice_123'),'Alice_123');assert.equal(xHandle(' @Alice_123 '),'Alice_123');
  for(const value of ['',undefined,null,'alice.eth','two words','https://x.com/alice','a'.repeat(16),'@@alice'])assert.equal(xHandle(value),undefined);
});
test('linked X handles are read only from Snapchain user data type 8, accepting enum names and numeric types',async()=>{
  const original=globalThis.fetch,config:Config={readUrl:'/api/read',validatorUrl:'',optimismRpcUrl:'',useGateway:true};let twitterType:string|number=8,value='alice_on_x',calls=0;
  globalThis.fetch=async input=>{calls++;const url=new URL(String(input),'https://freecast.example');assert.equal(url.pathname,'/api/read/v1/userDataByFid');assert.equal(url.searchParams.get('fid'),'456789');return Response.json({messages:[{data:{userDataBody:{type:6,value:'alice.eth'}}},{data:{userDataBody:{type:twitterType,value}}}]});};
  try{
    for(const [type,raw,expected] of [[8,'alice_on_x','alice_on_x'],['USER_DATA_TYPE_TWITTER','@Alice_X','Alice_X'],[8,'',undefined],[8,'alice.eth',undefined],[9,'github_user',undefined]] as const){twitterType=type;value=raw;invalidateProfile(456789);const person=await profile(config,456789);assert.equal(person.twitterUsername,expected);assert.equal(person.username,'alice.eth');}
    assert.equal(calls,5);
  }finally{invalidateProfile(456789);globalThis.fetch=original;}
});
