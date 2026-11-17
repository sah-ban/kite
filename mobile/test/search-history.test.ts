import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readSearchHistory,rememberSearch,searchEntry} from '../src/lib/search-history';

test('recent searches recover from invalid or oversized saved values',()=>{
  assert.deepEqual(readSearchHistory('not json'),[]);
  assert.deepEqual(readSearchHistory('{}'),[]);
  assert.deepEqual(readSearchHistory(JSON.stringify([null,42,'bad input','https://untrusted.example/profile','a'.repeat(2049),'37'])),['37']);
});
test('recent searches deduplicate equivalent profile and cast links and keep newest first',()=>{
  const hash='0x572549b948717ab9302a492c197121b0b844e7c8';
  assert.deepEqual(rememberSearch(['@KiteApp','37'],'https://farcaster.xyz/kiteapp'),['https://farcaster.xyz/kiteapp','37']);
  assert.deepEqual(rememberSearch([`https://kite.sahban.dev/cast/37/${hash}`],`https://farcaster.xyz/37/${hash}`),[`https://farcaster.xyz/37/${hash}`]);
  assert.equal(searchEntry('@KiteApp').label,'@kiteapp');
  assert.equal(searchEntry('37').label,'FID 37');
});
test('recent searches retain at most eight valid entries',()=>{
  const history=Array.from({length:12},(_,index)=>String(index+1));
  assert.deepEqual(rememberSearch(history,'99'),['99','1','2','3','4','5','6','7']);
});
