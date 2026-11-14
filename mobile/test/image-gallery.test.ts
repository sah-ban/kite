import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryEmbeds,resolveGallery} from '../src/lib/image-gallery';

test('gallery preserves cast image order, keeps the tapped image and skips links, videos and failed lookups',async()=>{
  const embeds=['https://example.com/a','https://example.com/link','https://example.com/b','https://example.com/video'];
  const images=await resolveGallery(embeds,embeds[2],'https://cdn.example/second',async url=>({kind:url===embeds[0]?'image':url===embeds[3]?'video':'link',url:'https://cdn.example/first'}));
  assert.deepEqual(images,['https://cdn.example/first','https://cdn.example/second']);assert.equal(images.indexOf('https://cdn.example/second'),1);
  assert.deepEqual(await resolveGallery(embeds,undefined,'https://cdn.example/selected',async()=>{throw Error('offline');}),['https://cdn.example/selected']);
});
test('gallery parameters accept only bounded HTTP image candidates and deduplicate resolved images',async()=>{
  assert.deepEqual(galleryEmbeds('bad json'),[]);assert.deepEqual(galleryEmbeds(JSON.stringify(['javascript:alert(1)','https://user:pass@example.com','https://example.com/image'])),['https://example.com/image']);
  assert.equal(galleryEmbeds(JSON.stringify(Array(8).fill('https://example.com/a'))).length,4);
  assert.deepEqual(await resolveGallery(['https://example.com/a','https://example.com/b'],undefined,'https://cdn.example/a',async()=>({kind:'image',url:'https://cdn.example/a'})),['https://cdn.example/a']);
});
