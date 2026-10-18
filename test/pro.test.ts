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

test('Pro expiry tooltip uses calendar months, clamped month ends and singular/plural days',async()=>{
  const {proExpiryLabel,proSubscriptionExpiry}=await import('../src/lib/pro');
  const label=(start:string,end:string)=>proExpiryLabel(Date.parse(end)/1000,Date.parse(start));
  assert.equal(label('2026-01-15T12:00:00Z','2026-03-20T12:00:00Z'),'Expires in 2 months 5 days');
  assert.equal(label('2026-01-31T12:00:00Z','2026-02-28T12:00:00Z'),'Expires in 1 month 0 days');
  assert.equal(label('2024-01-31T12:00:00Z','2024-03-01T12:00:00Z'),'Expires in 1 month 1 day');
  assert.equal(label('2026-10-18T12:00:00Z','2026-10-21T12:00:00Z'),'Expires in 0 months 3 days');
  assert.equal(label('2026-10-18T12:00:00Z','2026-10-19T11:00:00Z'),'Expires in less than 1 day');
  assert.equal(label('2026-10-18T12:00:00Z','2026-10-18T12:00:00Z'),'Subscription expired');
  assert.equal(proSubscriptionExpiry({tier_subscriptions:[{tier_type:'Pro',expires_at:100},{tier_type:1,expires_at:'200'}]}),200);
});
test('badge lookups deduplicate per node/FID and limit request concurrency',async()=>{
  const {cachedProExpiry}=await import('../src/lib/pro');const original=globalThis.fetch;
  const config:Config={readUrl:'https://badge-fixture.example',validatorUrl:'',optimismRpcUrl:'https://rpc.example'};
  let calls=0,active=0,maximum=0;const releases:(()=>void)[]=[];
  globalThis.fetch=async()=>{calls++;active++;maximum=Math.max(maximum,active);await new Promise<void>(resolve=>releases.push(resolve));active--;return Response.json({tierSubscriptions:[{tierType:1,expiresAt:9999999999}]});};
  try{
    const reads=Array.from({length:8},(_,i)=>cachedProExpiry(config,90000+i));assert.equal(cachedProExpiry(config,90000),reads[0]);
    await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,4);
    while(releases.length||active){releases.splice(0).forEach(release=>release());await new Promise(resolve=>setTimeout(resolve,0));}
    assert.deepEqual(await Promise.all(reads),Array(8).fill(9999999999));assert.equal(maximum,4);assert.equal(calls,8);
    await cachedProExpiry(config,90000);assert.equal(calls,8);
    const other=cachedProExpiry({...config,readUrl:'https://other-badge-fixture.example'},90000);await new Promise(resolve=>setTimeout(resolve,0));releases.splice(0).forEach(release=>release());await other;assert.equal(calls,9);
  }finally{globalThis.fetch=original;}
});
