import test from 'node:test';
import assert from 'node:assert/strict';
import {imageExtension,ImageSavePermissionError,saveDownloadedImage,type ImageDownloadIO} from '../src/lib/download-image-core';
const png=Uint8Array.from([137,80,78,71,13,10,26,10]);

test('downloads identify original image formats by bytes, including GIFs and URLs without extensions',()=>{
  assert.equal(imageExtension(png),'png');assert.equal(imageExtension(Uint8Array.from([255,216,255,1])),'jpg');
  for(const [header,extension] of [['GIF89a','gif'],['RIFF0000WEBP','webp'],['0000ftypavif','avif'],['0000ftypheic','heic']])assert.equal(imageExtension(new TextEncoder().encode(header)),extension);
  assert.throws(()=>imageExtension(new TextEncoder().encode('<html>error</html>')),/supported image/);
});
test('saving downloads the selected URL, saves the original format and cleans temporary files after success',async()=>{
  const calls:string[]=[];
  const io:ImageDownloadIO={requestPermission:async()=>{calls.push('permission');return true;},download:async url=>{calls.push(url);},header:async()=>new TextEncoder().encode('GIF89a'),save:async extension=>{calls.push('save:'+extension);},cleanup:async()=>{calls.push('cleanup');}};
  await saveDownloadedImage('https://images.example/opaque?token=one',io);
  assert.deepEqual(calls,['permission','https://images.example/opaque?token=one','save:gif','cleanup']);
});
test('denied permission and invalid URLs never download, and failed downloads/saves still clean up',async()=>{
  let downloads=0,saves=0,cleanups=0,allowed=false,fail='';
  const io:ImageDownloadIO={requestPermission:async()=>allowed,download:async()=>{downloads++;if(fail==='download')throw Error('offline');},header:async()=>fail==='format'?new Uint8Array():png,save:async()=>{saves++;if(fail==='save')throw Error('disk full');},cleanup:async()=>{cleanups++;}};
  await assert.rejects(saveDownloadedImage('javascript:alert(1)',io),/Invalid/);
  await assert.rejects(saveDownloadedImage('https://images.example/one',io),ImageSavePermissionError);assert.equal(downloads,0);assert.equal(cleanups,0);
  allowed=true;
  for(const stage of ['download','format','save']){fail=stage;await assert.rejects(saveDownloadedImage('https://images.example/one',io));}
  assert.equal(downloads,3);assert.equal(saves,1);assert.equal(cleanups,3);
});
