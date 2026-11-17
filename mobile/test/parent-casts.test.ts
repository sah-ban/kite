import test from 'node:test';
import assert from 'node:assert/strict';
import type {Cast} from '../src/lib/model';
import {parentCastPage} from '../src/lib/parent-casts';

const hash=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const cast=(n:number,parent?:number):Cast=>({hash:hash(n),signer:'0x'+'11'.repeat(32),data:{fid:n,timestamp:n,castAddBody:{text:`Cast ${n}`,mentions:[],mentionsPositions:[],embeds:[],...(parent?{parentCastId:{fid:parent,hash:hash(parent)}}:{})}}});
const signal=()=>new AbortController().signal;

test('parent pages follow references oldest first, then continue from the oldest loaded cast',async()=>{
  const root=cast(1),chain=[root,...Array.from({length:9},(_,i)=>cast(i+2,i+1))],calls:number[]=[];
  const resolve=async(fid:string)=>{calls.push(Number(fid));return chain[Number(fid)-1];};
  const first=await parentCastPage(chain[9],[],resolve,signal());
  assert.deepEqual(first.items.map(item=>item.data.fid),[5,6,7,8,9]);assert.equal(first.more,true);
  const second=await parentCastPage(first.items[0],[chain[9],...first.items],resolve,signal());
  assert.deepEqual(second.items.map(item=>item.data.fid),[1,2,3,4]);assert.equal(second.more,false);
  assert.deepEqual(calls,[9,8,7,6,5,4,3,2,1]);
});
test('a missing parent preserves loaded context and can be retried without refetching it',async()=>{
  const selected=cast(4,3),parent=cast(3,2);let available=false;
  const resolve=async(fid:string)=>{if(fid==='3')return parent;if(!available)throw Error('NotFound');return cast(2);};
  const first=await parentCastPage(selected,[],resolve,signal());
  assert.deepEqual(first.items,[parent]);assert.equal(first.more,true);assert.match(first.error,/earlier cast/);
  available=true;const retry=await parentCastPage(parent,[selected,parent],resolve,signal());
  assert.deepEqual(retry.items,[cast(2)]);assert.equal(retry.error,'');assert.equal(retry.more,false);
});
test('cyclic and invalid parent links stop without duplicating casts or making invalid requests',async()=>{
  const selected=cast(2,1),root=cast(1,2),calls:string[]=[];
  const cycle=await parentCastPage(selected,[],async fid=>{calls.push(fid);return root;},signal());
  assert.deepEqual(cycle.items,[root]);assert.equal(cycle.more,false);assert.match(cycle.error,/repeated/);assert.deepEqual(calls,['1']);
  const invalid=cast(3);invalid.data.castAddBody.parentCastId={fid:0,hash:'bad'};
  const result=await parentCastPage(invalid,[],async()=>{throw Error('Should not fetch');},signal());
  assert.equal(result.more,false);assert.match(result.error,/invalid/);
});
test('root casts make no parent requests and aborted requests do not return partial pages',async()=>{
  assert.deepEqual(await parentCastPage(cast(1),[],async()=>{throw Error('Should not fetch');},signal()),{items:[],more:false,error:''});
  const controller=new AbortController();
  await assert.rejects(()=>parentCastPage(cast(3,2),[],async()=>{controller.abort();throw Error('Aborted');},controller.signal),/Aborted/);
});
