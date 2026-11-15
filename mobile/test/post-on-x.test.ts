import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/lib/api';
import {postOnXIntent} from '../src/lib/post-on-x';
import type {Cast} from '../src/lib/model';

const hash='0x'+'22'.repeat(20);
test('X drafts use linked handles and omit opaque media while keeping article and quote links',async()=>{
  const calls:URL[]=[];
  const api=createApi('https://kite.example',async(input,init)=>{
    const url=new URL(String(input));calls.push(url);assert.ok(!init?.method||init.method==='GET');
    if(url.pathname.endsWith('userDataByFid')){
      const alice=url.searchParams.get('fid')==='37';
      return Response.json({messages:[{data:{userDataBody:{type:6,value:alice?'alice':'bob.base.eth'}}},{data:{userDataBody:{type:alice?8:'USER_DATA_TYPE_TWITTER',value:alice?'@alice_on_x':'invalid handle'}}}]});
    }
    assert.equal(url.pathname,'/api/embed');const source=url.searchParams.get('url')!;
    if(source.includes('unavailable'))return Response.json({}, {status:503});
    return Response.json({kind:source.includes('opaque-image')?'image':source.includes('opaque-video')?'video':'link',url:source,image:'https://example.com/article-og.png'});
  });
  const cast:Cast={hash,signer:'test',data:{fid:545039,timestamp:1,castAddBody:{text:'Hi  and ',mentions:[37,88],mentionsPositions:[3,8],embeds:[{url:'https://example.com/opaque-image'},{url:'https://example.com/opaque-video'},{url:'https://example.com/article'},{castId:{fid:37,hash}}],embedsDeprecated:['https://example.com/article','https://example.com/known.png','https://example.com/unavailable']}}};
  const intent=new URL(await postOnXIntent(cast,api));
  assert.equal(intent.origin,'https://twitter.com');assert.equal(intent.pathname,'/intent/tweet');
  assert.equal(intent.searchParams.get('text'),`Hi @alice_on_x and @.bob.base.eth (on Farcaster)\n\nhttps://example.com/article\n\nhttps://farcaster.xyz/~/conversations/${hash}\n\nhttps://example.com/unavailable`);
  assert.equal(calls.filter(url=>url.pathname==='/api/embed').length,4);
});
test('X drafts preserve Unicode and body URLs when optional cast fields or profiles are missing',async()=>{
  const api=createApi('https://kite.example',async()=>Response.json({}, {status:503}));
  const text='Hello 🌱 https://example.com/image.png';
  const cast:Cast={hash,signer:'test',data:{fid:545039,timestamp:1,castAddBody:{text}}};
  assert.equal(new URL(await postOnXIntent(cast,api)).searchParams.get('text'),text);
  cast.data.castAddBody={text:'Hello ',mentions:[37],mentionsPositions:[6]};
  assert.equal(new URL(await postOnXIntent(cast,api)).searchParams.get('text'),'Hello https://farcaster.xyz/~/profiles/37');
});
