import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProfileStorage} from '../src/lib/profile-storage';

test('profile storage keeps exact counts including zero capacity and over-limit usage',()=>{
  const result=parseProfileStorage({units:'39',limits:[{storeType:'Casts',name:'CASTS',used:13700,limit:13700},{storeType:2,used:'3686',limit:'12400'},{name:'REACTIONS',used:10,limit:0},{name:'STORAGE_LENDS',storeType:'None',used:0,limit:39}],tier_subscriptions:[{tier_type:'Pro',expires_at:2000}]});
  assert.equal(result.units,39);assert.equal(result.proExpiry,2000);
  assert.deepEqual(result.limits.map(({key,used,limit})=>({key,used,limit})),[{key:'casts',used:13700,limit:13700},{key:'links',used:3686,limit:12400},{key:'reactions',used:10,limit:0},{key:'storagelends',used:0,limit:39}]);
});

test('unavailable and invalid usage never becomes a fabricated zero count',()=>{
  assert.deepEqual(parseProfileStorage({}),{units:undefined,limits:[],proExpiry:undefined});
  const result=parseProfileStorage({units:-1,limits:[{name:'CASTS',used:-1,limit:100},{name:'LINKS',used:0,limit:'not a number'},{name:'REACTIONS',used:1,limit:Number.MAX_SAFE_INTEGER+1},{name:'UNKNOWN',used:0,limit:100},null]});
  assert.equal(result.units,undefined);assert.deepEqual(result.limits,[]);
  for(const response of [null,undefined,1,{limits:'bad'}])assert.throws(()=>parseProfileStorage(response));
});

test('subscription metadata handles both response styles and cannot hide valid usage',()=>{
  const limits=[{storeType:'STORE_TYPE_USER_DATA',used:9,limit:1025}];
  assert.equal(parseProfileStorage({limits,tierSubscriptions:[{tierType:1,expiresAt:'2000'},{tierType:1,expiresAt:3000}]}).proExpiry,3000);
  assert.equal(parseProfileStorage({limits,tier_subscriptions:[]}).proExpiry,0);
  const malformed=parseProfileStorage({limits,tier_subscriptions:[{tier_type:'Pro',expires_at:'bad'}]});
  assert.equal(malformed.proExpiry,undefined);assert.equal(malformed.limits[0].label,'Profile data');
  assert.equal(parseProfileStorage({limits,tierSubscriptions:[{tierType:1,expiresAt:Number.MAX_VALUE}]}).proExpiry,undefined);
});
