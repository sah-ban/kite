import test from 'node:test';
import assert from 'node:assert/strict';
import {pushRoute} from '../src/lib/push-routing';
const hash='0x'+'12'.repeat(20);
const data={type:'kite.activity',viewerFid:37,kind:'reply',actor:38,target:{fid:38,hash}};
test('push taps open only validated local routes for the signed-in recipient',()=>{
  assert.equal(pushRoute(data,37),`/cast/38/${hash}`);
  assert.equal(pushRoute({...data,kind:'follow'},37),'/profile/38');
  assert.equal(pushRoute(data,38),undefined);assert.equal(pushRoute(data,undefined),undefined);
  for(const value of [null,{}, {...data,type:'other'}, {...data,kind:'unknown'}, {...data,target:{fid:0,hash}}, {...data,target:{fid:38,hash:'https://attacker.example'}}, {...data,kind:'follow',actor:-1}, {...data,viewerFid:'37'}])assert.equal(pushRoute(value,37),undefined);
});
