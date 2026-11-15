import test from 'node:test';
import assert from 'node:assert/strict';
import {miniAppLaunchURL} from '../src/lib/miniapp';

test('miniapps open through Farcaster with the exact app path and parameters',()=>{
  const target='https://example.com/game/42?ref=alice&level=2#results';
  const launch=new URL(miniAppLaunchURL(target)!);
  assert.equal(launch.origin,'https://farcaster.xyz');assert.equal(launch.pathname,'/~/mini-apps/launch');assert.equal(launch.searchParams.get('url'),target);
  for(const value of ['javascript:alert(1)','https://user:secret@example.com','file:///tmp/app','http://example.com'])assert.equal(miniAppLaunchURL(value),undefined);
});
