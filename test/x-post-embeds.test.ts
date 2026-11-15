import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared URL parser is JavaScript.
import {xPostURL} from '../x-post-url.mjs';
// @ts-expect-error Server-side public X embed parsing is JavaScript.
import {parseXPost,parseXPostOEmbed,loadXPost} from '../x-post-embeds.mjs';

const id='463440424141459456',url=`https://x.com/Interior/status/${id}`;
const post={id_str:id,text:'Hello &amp; friends <literal> 🌱',created_at:'2014-05-05T22:09:42.000Z',user:{screen_name:'Interior',name:'Interior',profile_image_url_https:'https://pbs.twimg.com/profile_images/avatar.jpg'},mediaDetails:[{type:'photo',media_url_https:'https://pbs.twimg.com/media/photo.jpg'}]};
test('X URLs normalize supported post routes and reject lookalike or unsafe links',()=>{
  for(const value of [url,`https://twitter.com/Interior/status/${id}?s=20`,`https://mobile.twitter.com/Interior/status/${id}/photo/1`,`https://x.com/i/web/status/${id}`])assert.equal(xPostURL(value)?.id,id);
  for(const value of ['https://x.com.evil.example/Interior/status/'+id,'https://x.com@evil.example/Interior/status/'+id,'https://x.com/Interior','https://x.com/intent/tweet','https://x.com/i/status/0','https://x.com/i/status/99999999999999999999','file:///i/status/'+id])assert.equal(xPostURL(value),undefined);
});
test('public embed metadata preserves text, author, time and native thumbnail media',()=>{
  const result=parseXPost(post,id);assert.equal(result.username,'Interior');assert.equal(result.text,'Hello & friends <literal> 🌱');assert.equal(result.createdAt,post.created_at);assert.equal(result.avatar,post.user.profile_image_url_https);assert.deepEqual(result.media,[{url:'https://pbs.twimg.com/media/photo.jpg',kind:'image'}]);
  assert.throws(()=>parseXPost({...post,id_str:'123'},id));assert.throws(()=>parseXPost({...post,user:{screen_name:'invalid/handle'}},id));
  const unsafe=parseXPost({...post,user:{...post.user,profile_image_url_https:'http://127.0.0.1/private'},mediaDetails:[{type:'photo',media_url_https:'https://pbs.twimg.com.evil.example/photo.jpg'}]},id);assert.equal(unsafe.avatar,undefined);assert.deepEqual(unsafe.media,[]);
});
test('entity ranges expand ordinary links and remove attached media URLs without corrupting Unicode',()=>{
  const text='Hello 🌱 &amp; friends https://t.co/a https://t.co/photo';
  const entity=(value:string)=>({url:value,indices:[text.indexOf(value),text.indexOf(value)+value.length]});
  const result=parseXPost({...post,text,entities:{urls:[{...entity('https://t.co/a'),expanded_url:'https://example.com/story?a=1&copy=2'}],media:[entity('https://t.co/photo')]}},id);
  assert.equal(result.text,'Hello 🌱 & friends https://example.com/story?a=1&copy=2');
});
test('oEmbed fallback extracts plain text without executing scripts or reading unrelated paragraphs',()=>{
  const data={url,author_url:'https://x.com/Interior',author_name:'Interior',html:'<blockquote><p>Hello &amp; friends<br>Line two<script>bad()</script></p>— Interior <a>May 5, 2014</a></blockquote><p>Unrelated</p>'};
  const result=parseXPostOEmbed(data,id);assert.equal(result.text,'Hello & friends\nLine two');assert.deepEqual(result.media,[]);assert.equal(result.url,url);
  assert.throws(()=>parseXPostOEmbed({...data,url:'https://evil.example/status/'+id},id));
});
test('public embed failures use oEmbed and then a clear unavailable result',async()=>{
  const reference={id,url},calls:string[]=[];
  const fallback=await loadXPost(reference,async(target:string)=>{calls.push(target);if(target.includes('syndication'))throw Error('unavailable');return {url,author_url:'https://x.com/Interior',author_name:'Interior',html:'<p>Fallback post</p>'};});
  assert.equal(fallback.text,'Fallback post');assert.equal(calls.length,2);assert.equal(new URL(calls[1]).searchParams.get('omit_script'),'true');
  const unavailable=await loadXPost(reference,async()=>{throw Error('unavailable');});assert.equal(unavailable.unavailable,true);assert.equal(unavailable.url,url);
});
