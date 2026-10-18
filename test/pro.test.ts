import test from 'node:test';
import assert from 'node:assert/strict';
import { activeProSubscription } from '../src/lib/pro';
import { saveProfile, type ProfileDraft } from '../src/lib/profile-edit';
import type { Config } from '../src/lib/hub';
test('Pro status accepts actual snake_case node responses and camelCase SDK responses',()=>{
  assert.equal(activeProSubscription({tier_subscriptions:[{tier_type:'Pro',expires_at:'2001'}]},2000),true);
  assert.equal(activeProSubscription({tierSubscriptions:[{tierType:1,expiresAt:2001}]},2000),true);
  for(const expires_at of [0,'0',1999,2000])assert.equal(activeProSubscription({tier_subscriptions:[{tier_type:'Pro',expires_at}]},2000),false);
  assert.equal(activeProSubscription({tierSubscriptions:[]},2000),false);
  assert.equal(activeProSubscription({tierSubscriptions:[{tierType:0,expiresAt:999999}]},2000),false);
  for(const data of [{},null,{tier_subscriptions:'bad'},{tier_subscriptions:[{tier_type:'Pro'}]},{tierSubscriptions:[{tierType:1,expiresAt:'not a timestamp'}]}])assert.throws(()=>activeProSubscription(data,2000),/Could not verify/);
});
test('banner save rechecks Pro before any profile write and blocks expired, absent and unknown status',async()=>{
  const original=globalThis.fetch;let status:unknown={tier_subscriptions:[{tier_type:'Pro',expires_at:1}]},writes=0;
  Object.defineProperty(globalThis,'window',{value:{location:{hostname:'localhost'}},configurable:true});
  const config:Config={readUrl:'/api/read',validatorUrl:'/api/write',optimismRpcUrl:'https://rpc.example',useGateway:true};
  const session={fid:123,address:'0x0000000000000000000000000000000000000001' as const,key:'0x11' as const,remote:true as const};
  const draft:ProfileDraft={name:'Before',bio:'',avatar:'',banner:'https://example.com/old.png',website:''};
  globalThis.fetch=async(input)=>{
    if(String(input).includes('storageLimitsByFid'))return Response.json(status);
    writes++;return Response.json({});
  };
  try{
    for(status of [{tier_subscriptions:[{tier_type:'Pro',expires_at:1}]},{tierSubscriptions:[]},{}]){
      await assert.rejects(saveProfile(config,session,draft,{...draft,name:'After',banner:'https://example.com/new.png'}),/Pro/);
      await assert.rejects(saveProfile(config,session,draft,{...draft,banner:''}),/Pro/);
    }
    assert.equal(writes,0);
  }finally{globalThis.fetch=original;}
});
