import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestCache} from '../src/lib/request-cache';

test('read cache shares pending reads, expires successful values and evicts least recently used entries',async()=>{
  let time=0,calls=0;const cached=createRequestCache<string,number>(2,100,()=>time),load=async()=>++calls;
  assert.deepEqual(await Promise.all([cached('a',load),cached('a',load)]),[1,1]);
  await cached('b',load);await cached('a',load);await cached('c',load);
  assert.equal(await cached('a',load),1);assert.equal(await cached('b',load),4);
  time=101;assert.equal(await cached('b',load),5);
});
test('one aborted reader does not cancel a shared read, and errors remain retryable',async()=>{
  const cached=createRequestCache<string,number>(2,100),a=new AbortController(),b=new AbortController();
  let finish!:(value:number)=>void,shared!:AbortSignal;
  const load=(signal:AbortSignal)=>{shared=signal;return new Promise<number>(resolve=>finish=resolve);};
  const first=cached('a',load,a.signal),second=cached('a',load,b.signal);
  await Promise.resolve();a.abort();await assert.rejects(first);assert.equal(shared.aborted,false);
  finish(7);assert.equal(await second,7);assert.equal(await cached('a',load),7);
  await assert.rejects(cached('error',async()=>{throw Error('Offline');}),/Offline/);
  assert.equal(await cached('error',async()=>8),8);
});
test('all aborted readers cancel the underlying request and do not poison a replacement',async()=>{
  const cached=createRequestCache<string,number>(2,100),a=new AbortController();let shared!:AbortSignal,fail!:(error:Error)=>void;
  const first=cached('a',signal=>{shared=signal;return new Promise<number>((_,reject)=>fail=reject);},a.signal);
  await Promise.resolve();a.abort();await assert.rejects(first);assert.equal(shared.aborted,true);
  const next=cached('a',async()=>9);fail(Error('Old request cancelled'));assert.equal(await next,9);
  assert.equal(await cached('a',async()=>10),9);
  await assert.rejects(async()=>cached('a',async()=>11,a.signal));
});
