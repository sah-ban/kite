import test from 'node:test';
import assert from 'node:assert/strict';
import { readLikedCasts } from '../src/lib/profile-likes';
import type { Config } from '../src/lib/hub';
const config:Config={readUrl:'/api/read',validatorUrl:'',optimismRpcUrl:'',useGateway:true};
const hash=(fid:number)=>'0x'+fid.toString(16).padStart(40,'0');
const cast=(fid:number)=>({hash:hash(fid),signer:'0xabc',data:{fid,timestamp:fid,castAddBody:{text:`Cast ${fid}`,mentions:[],mentionsPositions:[],embeds:[]}}});
const reaction=(target:number,type:string|number=3,kind:string|number=1,owner=37)=>({data:{fid:owner,type,timestamp:100-target,reactionBody:{type:kind,targetCastId:{fid:target,hash:hash(target)}}}});

test('profile likes preserve reaction order, include liked replies and resolve with bounded concurrency',async()=>{
  const original=globalThis.fetch;let active=0,max=0,calls=0;
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input),'https://client.example');
    if(url.pathname.endsWith('reactionsByFid')){
      assert.equal(url.searchParams.get('fid'),'37');assert.equal(url.searchParams.get('reaction_type'),'Like');assert.equal(url.searchParams.get('reverse'),'true');assert.equal(url.searchParams.get('pageToken'),'opaque+/=');
      return Response.json({messages:[8,7,6,5,4,3,2,1].map(n=>reaction(n)),nextPageToken:'next+/='});
    }
    calls++;active++;max=Math.max(max,active);const fid=Number(url.searchParams.get('fid'));
    await new Promise(resolve=>setTimeout(resolve,fid));active--;
    const value=cast(fid);if(fid===8)Object.assign(value.data.castAddBody,{parentCastId:{fid:9,hash:hash(9)}});
    return Response.json(value);
  };
  try{
    const page=await readLikedCasts(config,37,'newest','opaque+/=');
    assert.deepEqual(page.messages.map(c=>c.data.fid),[8,7,6,5,4,3,2,1]);assert.equal(page.nextPageToken,'next+/=');assert.equal(calls,8);assert.equal(max,5);assert.ok(page.messages[0].data.castAddBody.parentCastId);
  }finally{globalThis.fetch=original;}
});

test('profile likes exclude recasts, removals, other users and URL targets; deduplicate and skip deleted casts',async()=>{
  const original=globalThis.fetch;const fetched:number[]=[];
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input),'https://client.example');
    if(url.pathname.endsWith('reactionsByFid')){
      assert.equal(url.searchParams.get('reverse'),'false');
      return Response.json({messages:[reaction(1,'MESSAGE_TYPE_REACTION_ADD','REACTION_TYPE_LIKE'),reaction(1),reaction(2,4),reaction(3,3,2),reaction(4,3,1,99),{data:{fid:37,type:3,reactionBody:{type:1,targetUrl:'https://example.com'}}},reaction(5)]});
    }
    const fid=Number(url.searchParams.get('fid'));fetched.push(fid);return fid===5?new Response('deleted',{status:404}):Response.json(cast(fid));
  };
  try{const page=await readLikedCasts(config,37,'oldest');assert.deepEqual(page.messages.map(c=>c.data.fid),[1]);assert.equal(page.nextPageToken,'');assert.deepEqual(fetched,[1,5]);}
  finally{globalThis.fetch=original;}
});

test('temporary failures remain retryable rather than silently dropping liked casts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(input)=>String(input).includes('reactionsByFid')?Response.json({messages:[reaction(1)]}):new Response('unavailable',{status:503});
  try{await assert.rejects(readLikedCasts(config,37,'newest'),/503/);}
  finally{globalThis.fetch=original;}
});

test('HTTP 400 wrapping gRPC NotFound skips unavailable liked casts and preserves pagination',async()=>{
  const original=globalThis.fetch;
  const missing={error:'Failed to get cast',error_detail:'status: NotFound, message: "cast not found", details: [], metadata: MetadataMap { headers: {} }'};
  globalThis.fetch=async(input)=>{
    const url=new URL(String(input),'https://client.example');
    if(url.pathname.endsWith('reactionsByFid'))return Response.json({messages:[reaction(1),reaction(2)],nextPageToken:'older+/='});
    return url.searchParams.get('fid')==='1'?Response.json(missing,{status:400}):Response.json(cast(2));
  };
  try{const page=await readLikedCasts(config,37,'newest');assert.deepEqual(page.messages.map(c=>c.data.fid),[2]);assert.equal(page.nextPageToken,'older+/=');}
  finally{globalThis.fetch=original;}
});

test('unrelated HTTP 400 responses are not mistaken for unavailable liked casts',async()=>{
  const original=globalThis.fetch;
  try{
    for(const body of ['invalid request',JSON.stringify({error:'Failed to get cast',error_detail:'status: InvalidArgument, message: "invalid hash"'}),JSON.stringify({error:'NotFound is not a recognized argument'})]){
      globalThis.fetch=async(input)=>String(input).includes('reactionsByFid')?Response.json({messages:[reaction(1)]}):new Response(body,{status:400});
      await assert.rejects(readLikedCasts(config,37,'newest'),/Node returned 400/);
    }
  }finally{globalThis.fetch=original;}
});
