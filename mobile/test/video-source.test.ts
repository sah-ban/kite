import test from 'node:test';
import assert from 'node:assert/strict';
import {videoSource} from '../src/lib/video-source';

test('video sources preserve signed URLs and infer extensionless HLS from the server MIME type',()=>{
  const url='https://video.example/stream?token=opaque%2Bvalue&expires=123';
  assert.deepEqual(videoSource(url,'application/vnd.apple.mpegurl; charset=utf-8'),{uri:url,contentType:'hls'});
  assert.equal(videoSource(url,'application/x-mpegURL')?.contentType,'hls');
  assert.equal(videoSource('https://video.example/PLAYLIST.M3U8?token=abc')?.contentType,'hls');
  assert.equal(videoSource(url,'application/dash+xml')?.contentType,'dash');
  assert.equal(videoSource('https://video.example/manifest.mpd')?.contentType,'dash');
  assert.equal(videoSource(url,'video/mp4')?.contentType,'auto');
});
test('malformed video routes cannot pass unsafe source URLs to the player',()=>{
  for(const value of ['javascript:alert(1)','file:///private/video.mp4','https://user:pass@video.example/movie.mp4',['https://video.example/a'],undefined])assert.equal(videoSource(value),undefined);
});
