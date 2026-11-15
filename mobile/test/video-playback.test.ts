import test from 'node:test';
import assert from 'node:assert/strict';
import {createVideoPlayback} from '../src/lib/video-playback';
function player(){return {starts:0,pauses:0,play(){this.starts++;},pause(){this.pauses++;}};}
test('autoplay chooses one visible player and advances when it leaves view',async()=>{
  const videos=createVideoPlayback(),a=player(),b=player(),removeA=videos.register(a),removeB=videos.register(b);
  assert.equal(a.starts,1);assert.equal(b.starts,0);removeA();await Promise.resolve();assert.equal(a.pauses,1);assert.equal(b.starts,1);removeB();
});
test('manual pause stays paused, while explicitly playing another clip takes ownership',()=>{
  const videos=createVideoPlayback(),a=player(),b=player();videos.register(a);a.pause();videos.register(b);
  assert.equal(a.starts,1);assert.equal(b.starts,0);videos.play(b);assert.equal(a.pauses,2);assert.equal(b.starts,1);
});
test('screen blur stops all videos without briefly starting another, and stale play events cannot resume them',async()=>{
  const videos=createVideoPlayback(),a=player(),b=player(),removeA=videos.register(a),removeB=videos.register(b);
  removeA();removeB();await Promise.resolve();assert.equal(b.starts,0);videos.didPlay(a);assert.equal(a.starts,1);assert.equal(a.pauses,2);
});
