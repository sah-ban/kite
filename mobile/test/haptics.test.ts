import test from 'node:test';
import assert from 'node:assert/strict';
import {createHapticFeedback,type HapticKind} from '../src/lib/haptics-core';

test('haptics honor the preference and app availability without calling the device',()=>{
  let available=false;const calls:HapticKind[]=[];
  const play=createHapticFeedback({available:()=>available,perform:async kind=>{calls.push(kind);}});
  play('selection');play('success');assert.deepEqual(calls,[]);
  available=true;play('selection');assert.deepEqual(calls,['selection']);
  available=false;play('error');assert.deepEqual(calls,['selection']);
});
test('nested taps are coalesced while distinct action outcomes remain available',()=>{
  let now=1000;const calls:HapticKind[]=[];
  const play=createHapticFeedback({available:()=>true,perform:async kind=>{calls.push(kind);},now:()=>now});
  play('selection');play('light');play('success');play('success');
  assert.deepEqual(calls,['selection','success']);
  now+=70;play('toggleOn');now+=70;play('toggleOff');play('error');
  assert.deepEqual(calls,['selection','success','toggleOn','toggleOff','error']);
});
test('unsupported devices and rejected native effects never throw or reject into the user action',async()=>{
  const sync=createHapticFeedback({available:()=>true,perform:()=>{throw Error('No motor');}});
  assert.doesNotThrow(()=>sync('warning'));
  const asyncFailure=createHapticFeedback({available:()=>true,perform:async()=>{throw Error('Disabled by system');}});
  assert.doesNotThrow(()=>asyncFailure('success'));await new Promise(resolve=>setTimeout(resolve,0));
});
