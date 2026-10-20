import test from 'node:test';
import assert from 'node:assert/strict';
import { CastType, FarcasterNetwork, Message, MessageData, NobleEd25519Signer, makeCastAdd, validations } from '@farcaster/core';
import { bytesToHex, encodeAbiParameters } from 'viem';
import { encodeForSnapchain, deleteCast } from '../src/lib/signing';
import { requester, metadataAbi } from '../src/lib/attribution';
import { filterBySigner, resolveCast, onlyCastAdds, type Cast, type Config } from '../src/lib/hub';

const config: Config={readUrl:'https://read.example',optimismRpcUrl:'https://rpc.example'};
const cast=(hash:string,signer='0xabc'):Cast=>({hash,signer,data:{fid:37,timestamp:1,castAddBody:{text:'hello',mentions:[],mentionsPositions:[],embeds:[]}}});
test('signed cast survives Snapchain dataBytes encoding and signature validation',async()=>{
  const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7));
  const built=await makeCastAdd({text:'A real signed message',mentions:[],mentionsPositions:[],embeds:[],embedsDeprecated:[],type:CastType.CAST},{fid:37,network:FarcasterNetwork.MAINNET},signer);
  assert.ok(built.isOk());
  const decoded=Message.decode(encodeForSnapchain(built.value));
  assert.ok(decoded.dataBytes?.length);
  assert.equal(decoded.data,undefined);
  assert.equal(MessageData.decode(decoded.dataBytes!).castAddBody?.text,'A real signed message');
  assert.equal(bytesToHex(decoded.hash),bytesToHex(built.value.hash));
  const validated=await validations.validateMessage({...decoded,data:MessageData.decode(decoded.dataBytes!)});
  assert.ok(validated.isOk(),String(validated.isErr()&&validated.error));
  const tampered={...decoded,dataBytes:decoded.dataBytes!.slice()};
  tampered.dataBytes![0]^=1;
  const invalid=await validations.validateMessage(tampered);
  assert.ok(invalid.isErr());
});
test('requesting client FID is decoded from both hex and hub base64 metadata',()=>{
  const data=encodeAbiParameters(metadataAbi,[{requestFid:9152n,requestSigner:'0x0000000000000000000000000000000000000001',signature:'0x1234',deadline:2000000000n}]);
  assert.equal(requester(data),9152);
  assert.equal(requester(Buffer.from(data.slice(2),'hex').toString('base64')),9152);
  assert.equal(requester('not metadata'),undefined);
});
test('signer filters compare case-insensitively and preserve unknown clients in exclusion',()=>{
  const casts=[cast('a','0xaBc'),cast('b','0xdef')];
  assert.deepEqual(filterBySigner(casts,['0xABC'],'include').map(c=>c.hash),['a']);
  assert.deepEqual(filterBySigner(casts,['0xABC'],'exclude').map(c=>c.hash),['b']);
  assert.equal(filterBySigner(casts,[],'all').length,2);
});
test('short cast hash pages author casts, then queries the full identifier',async()=>{
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'window',{value:{location:{hostname:'test.example'}},configurable:true});
  const hash='0x50184b62b4c52fd76628713562e1eda3dccaf63d';
  const calls:string[]=[];
  globalThis.fetch=async input=>{
    const url=String(input);calls.push(url);
    if(url.includes('castById')){assert.ok(url.includes(hash));return Response.json(cast(hash));}
    if(url.includes('pageToken'))return Response.json({messages:[cast(hash)]});
    return Response.json({messages:[],nextPageToken:'opaque+/='});
  };
  try{const found=await resolveCast(config,37,'0x50184b62');assert.equal(found.hash,hash);assert.equal(calls.length,3);assert.ok(calls[1].includes('pageToken=opaque%2B%2F%3D'));}
  finally{globalThis.fetch=originalFetch;}
});
test('invalid cast prefix fails before any request',async()=>{
  await assert.rejects(resolveCast(config,37,'0xnope'),/cast hash/);
});
test('cast feeds omit CAST_REMOVE tombstones and malformed records',()=>{
  const visible=cast('0x50184b62b4c52fd76628713562e1eda3dccaf63d');
  const removal={hash:'0xremoved',signer:'0xabc',data:{fid:37,timestamp:1,type:'MESSAGE_TYPE_CAST_REMOVE',castRemoveBody:{targetHash:'base64'}}};
  assert.deepEqual(onlyCastAdds([visible,removal,{data:null},{}]),[visible]);
});

test('local cast deletion signs the target and succeeds without read-node confirmation',async()=>{
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
  const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7));
  const target=cast('0x'+'ab'.repeat(20));
  const session={fid:37,address:'0x0000000000000000000000000000000000000001' as const,key:'0x11' as const,signer};
  let submissions=0,reads=0;
  globalThis.fetch=async(input,init)=>{
    if(String(input).includes('/api/write/')){
      submissions++;const message=Message.decode(init!.body as Uint8Array),data=MessageData.decode(message.dataBytes!);
      assert.equal(data.fid,37);assert.equal(data.type,2);assert.equal(bytesToHex(data.castRemoveBody!.targetHash),target.hash);
      assert.ok((await validations.validateMessage({...message,data})).isOk());
      return Response.json({accepted:true});
    }
    reads++;return Response.json(target);
  };
  try{
    await assert.rejects(deleteCast(config,{...session,fid:999},target),/only delete your own/);
    assert.equal(submissions,0);assert.equal(reads,0);
    await deleteCast(config,session,target);assert.equal(submissions,1);assert.equal(reads,0);
  }finally{globalThis.fetch=originalFetch;}
});

test('local signer publishes image-only casts with valid URL embeds',async()=>{
  const {postCast}=await import('../src/lib/signing');
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
  const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7));
  const session={fid:37,address:'0x0000000000000000000000000000000000000001' as const,key:'0x11' as const,signer};
  let submissions=0;const image='https://i.ibb.co/fixture/image.png';
  globalThis.fetch=async(input,init)=>{
    if(String(input).includes('/api/write/')){
      submissions++;const message=Message.decode(init!.body as Uint8Array),data=MessageData.decode(message.dataBytes!);
      assert.equal(data.castAddBody?.text,'');assert.equal(data.castAddBody?.embeds[0].url,image);
      assert.ok((await validations.validateMessage({...message,data})).isOk());return Response.json({});
    }
    return Response.json(cast('0x'+'ab'.repeat(20)));
  };
  try{await postCast(config,session,'',undefined,undefined,[],[image]);assert.equal(submissions,1);}
  finally{globalThis.fetch=originalFetch;}
});
