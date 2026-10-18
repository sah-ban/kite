import test from 'node:test';
import assert from 'node:assert/strict';
import { NobleEd25519Signer, Message, MessageData } from '@farcaster/core';
import { bytesToHex } from 'viem';
import { canEditProfile, profileChanges, saveProfile, type ProfileDraft } from '../src/lib/profile-edit';
import { updateProfileField } from '../src/lib/signing';
import { loadGaslessSdk } from '../src/lib/gasless-sdk';
import { profile, invalidateProfile, type Config } from '../src/lib/hub';
const sdk=await loadGaslessSdk();
const config:Config={readUrl:'/api/read',validatorUrl:'/api/write',optimismRpcUrl:'https://rpc.example',useGateway:true};
const original:ProfileDraft={name:'Tester',bio:'Original',avatar:'https://example.com/avatar.png',banner:'',website:''};
const remote={fid:98765,address:'0x0000000000000000000000000000000000000001' as const,key:'0x'+'11'.repeat(32) as `0x${string}`,remote:true as const};
const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7));
const local={...remote,key:bytesToHex((await signer.getSignerKey())._unsafeUnwrap()),remote:false as const,signer};
Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
test('profile edits validate all fields and UTF-8 byte limits before any write',()=>{
  assert.deepEqual(profileChanges(original,{...original,bio:'New'}),[{type:3,value:'New',label:'Bio'}]);
  assert.equal(profileChanges(original,{...original,name:'😀'.repeat(8)}).length,1);
  assert.throws(()=>profileChanges(original,{...original,name:'😀'.repeat(9)}),/32 UTF-8/);
  assert.throws(()=>profileChanges(original,{...original,bio:'a'.repeat(257)}),/256 UTF-8/);
  for(const url of ['javascript:alert(1)','file:///tmp/a','https://user:pass@example.com/a'])assert.throws(()=>profileChanges(original,{...original,avatar:url}),/HTTP/);
  assert.equal(profileChanges(original,{...original,avatar:'',banner:'https://example.com/banner.png'}).length,2);
});
test('profile editing checks exact active signer and scope without breaking existing posting keys',async()=>{
  const fetch=globalThis.fetch;let scopes:(number|string)[]=[1,2,3,4,5,6],expiresAt=Date.now()/1000+3600,source:string|number='SIGNER_SOURCE_OFFCHAIN',wrongKey=false;
  globalThis.fetch=async()=>Response.json({signers:[{fid:local.fid,key:wrongKey?'0x00':local.key,keyType:1,source,scopes,expiresAt}]});
  try{
    assert.equal(await canEditProfile(config,remote),true);assert.equal(await canEditProfile(config,local),false);
    scopes=[...scopes,'MESSAGE_TYPE_USER_DATA_ADD'];assert.equal(await canEditProfile(config,local),true);
    scopes=[11];assert.equal(await canEditProfile(config,local),true);expiresAt=1;assert.equal(await canEditProfile(config,local),false);
    source='SIGNER_SOURCE_ONCHAIN';assert.equal(await canEditProfile(config,local),true);wrongKey=true;assert.equal(await canEditProfile(config,local),false);
  }finally{globalThis.fetch=fetch;}
});
test('local profile messages support modern banner type and retain valid dataBytes signatures',async()=>{
  const fetch=globalThis.fetch;let writes=0;
  globalThis.fetch=async(_input,init)=>{
    writes++;const envelope=Message.decode(init!.body as Uint8Array),message=sdk.Message.decode(init!.body as Uint8Array),data=sdk.MessageData.decode(message.dataBytes!);
    assert.equal(envelope.data,undefined);assert.equal(data.fid,local.fid);assert.equal(data.type,sdk.MessageType.USER_DATA_ADD);assert.equal(data.userDataBody?.type,10);assert.equal(data.userDataBody?.value,'https://example.com/banner.png');
    assert.ok((await sdk.validations.validateMessage({...message,data})).isOk());return Response.json({});
  };
  try{await updateProfileField(config,local,10,'https://example.com/banner.png');assert.equal(writes,1);await assert.rejects(updateProfileField(config,local,6,'unowned-name'),/Invalid profile/);assert.equal(writes,1);}
  finally{globalThis.fetch=fetch;}
});
test('remote profile save sends only changed fields, confirms reads and invalidates cached profiles',async()=>{
  const fetch=globalThis.fetch;const values=new Map<number,string>([[2,'Tester'],[3,'Original']]);const writes:unknown[]=[];
  globalThis.fetch=async(input,init)=>{
    if(String(input).endsWith('/action')){const body=JSON.parse(String(init?.body));writes.push(body);values.set(body.type,body.value);return Response.json({hash:'0x'+'ab'.repeat(20)});}
    return Response.json({messages:[...values].map(([type,value])=>({data:{userDataBody:{type,value}}}))});
  };
  try{
    invalidateProfile(remote.fid);assert.equal((await profile(config,remote.fid)).name,'Tester');
    await saveProfile(config,remote,original,{...original,name:'Updated',banner:'https://example.com/banner.png',website:'https://example.com'});
    assert.deepEqual(writes,[{kind:'profile',type:2,value:'Updated'},{kind:'profile',type:10,value:'https://example.com/banner.png'},{kind:'profile',type:5,value:'https://example.com'}]);assert.equal((await profile(config,remote.fid)).name,'Updated');assert.equal((await profile(config,remote.fid)).banner,'https://example.com/banner.png');
  }finally{globalThis.fetch=fetch;invalidateProfile(remote.fid);}
});
test('partial profile failure reports confirmed fields and keeps the refreshed read-node state',async()=>{
  const fetch=globalThis.fetch;let writes=0;
  globalThis.fetch=async(input)=>{
    if(String(input).endsWith('/action')){writes++;return writes===1?Response.json({hash:'0x'+'ab'.repeat(20)}):Response.json({error:'Fixture submission failed'},{status:502});}
    return Response.json({messages:[{data:{userDataBody:{type:2,value:'Updated'}}}]});
  };
  try{await assert.rejects(saveProfile(config,remote,original,{...original,name:'Updated',bio:'New'}),/1 of 2 changes confirmed.*Fixture submission failed/);assert.equal(writes,2);}
  finally{globalThis.fetch=fetch;invalidateProfile(remote.fid);}
});
