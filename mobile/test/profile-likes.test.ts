import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/lib/api';
import type {Cast} from '../src/lib/model';

const hash=(value:string)=>'0x'+value.repeat(40);
const cast=(fid:number,hash:string,timestamp:number):Cast=>({hash,signer:'public',data:{fid,timestamp,castAddBody:{text:`Liked cast by ${fid}`}}});
const reaction=(fid:number,targetFid:number,targetHash:string)=>({data:{fid,type:3,reactionBody:{type:1,targetCastId:{fid:targetFid,hash:targetHash}}}});
test('profile likes preserve reaction order and cursor, deduplicate targets and skip deleted casts',async()=>{
  const requests:URL[]=[],first=cast(37,hash('a'),1),second=cast(1,hash('b'),999);
  const api=createApi('https://kite.example',async input=>{
    const url=new URL(String(input));requests.push(url);
    if(url.pathname.endsWith('/reactionsByFid'))return Response.json({messages:[reaction(268438,37,first.hash),reaction(268438,42,hash('c')),reaction(268438,1,second.hash),reaction(268438,37,first.hash),reaction(999,2,hash('d')),{data:{fid:268438,type:4,reactionBody:{type:1,targetCastId:{fid:2,hash:hash('e')}}}}],nextPageToken:'next+/='});
    const fid=Number(url.searchParams.get('fid'));
    return fid===42?Response.json({error_detail:'status: NotFound, message: cast not found'},{status:400}):Response.json(fid===37?first:second);
  });
  const result=await api.profileLikes(268438,'previous+/=');assert.deepEqual(result.items,[first,second]);assert.equal(result.next,'next+/=');assert.equal(requests.length,4);
  assert.equal(requests[0].searchParams.get('pageToken'),'previous+/=');assert.equal(requests[0].searchParams.get('reaction_type'),'Like');assert.equal(requests[0].searchParams.get('reverse'),'true');
});
test('unavailable nodes are reported and mismatched cast targets are discarded',async()=>{
  const api=createApi('https://kite.example',async input=>String(input).includes('/reactionsByFid')?Response.json({messages:[reaction(1,37,hash('a'))]}):Response.json({},{status:503}));
  await assert.rejects(api.profileLikes(1));
  const wrong=createApi('https://kite.example',async input=>String(input).includes('/reactionsByFid')?Response.json({messages:[reaction(1,37,hash('a'))]}):Response.json(cast(99,hash('a'),1)));
  assert.deepEqual((await wrong.profileLikes(1)).items,[]);
});
