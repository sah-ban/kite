import test from 'node:test';
import assert from 'node:assert/strict';
import {clientRoute} from '../src/lib/routes';
import {profile, invalidateProfile, type Config} from '../src/lib/hub';
import {githubHandle, walletAddress, verificationWallet, readVerifiedWallets} from '../src/lib/profile-about';

const config:Config={readUrl:'/api/read',optimismRpcUrl:'',useGateway:true};
const fid=268438,eth='0x'+'ab'.repeat(20),sol='1'.repeat(31)+'2';
const verification=(address:string,protocol:unknown=0)=>({data:{fid,type:7,verificationAddAddressBody:{address,protocol}}});

test('About URLs retain profile FID, accept trailing slashes, and reject invalid IDs',()=>{
  for(const path of ['/profile/268438/about','/profile/268438/about/'])assert.deepEqual(clientRoute(path),{kind:'about',fid});
  for(const path of ['/profile/0/about','/profile/-1/about','/profile/9007199254740992/about'])assert.deepEqual(clientRoute(path),{kind:'home'});
});

test('profile metadata reads social and account details from numeric and named fields',async()=>{
  const original=globalThis.fetch;
  try{
    for(const named of [false,true]){
      const values=[['USER_DATA_TYPE_TWITTER',8,'test_account'],['USER_DATA_TYPE_GITHUB',9,'octo-cat'],['USER_DATA_TYPE_LOCATION',7,'geo:51.5,-0.1'],['USER_DATA_PRIMARY_ADDRESS_ETHEREUM',11,eth],['USER_DATA_PRIMARY_ADDRESS_SOLANA',12,sol],['USER_DATA_TYPE_PROFILE_TOKEN',13,'eip155:8453/erc20:0x'+'ab'.repeat(20)],['USER_DATA_TYPE_LIVE_AT',14,'https://example.com/live']] as const;
      globalThis.fetch=async()=>Response.json({messages:values.map(([type,id,value])=>({data:{userDataBody:{type:named?type:id,value}}}))});
      invalidateProfile(fid);const result=await profile(config,fid);
      assert.equal(result.twitterUsername,'test_account');assert.equal(result.githubUsername,'octo-cat');assert.equal(result.location,'geo:51.5,-0.1');assert.equal(result.primaryEthereumAddress,eth);assert.equal(result.primarySolanaAddress,sol);assert.equal(result.profileToken,values[5][2]);assert.equal(result.liveActivityUrl,'https://example.com/live');
    }
  }finally{invalidateProfile(fid);globalThis.fetch=original;}
});

test('social handles and wallet addresses cannot construct foreign or executable links',()=>{
  assert.equal(githubHandle(' @octo-cat '),'octo-cat');
  for(const value of ['javascript:alert(1)','https://github.com/a','a/b','a?tab=keys','-name','a--b','a'.repeat(40)])assert.equal(githubHandle(value),undefined);
  assert.equal(walletAddress(eth.toUpperCase(),'ethereum'),eth);
  assert.equal(walletAddress('0x'+'00'.repeat(32),'solana'),'1'.repeat(32));
  assert.equal(walletAddress('0x'+'00'.repeat(31)+'01','solana'),sol);
  assert.equal(walletAddress(sol,'solana'),sol);
  for(const value of ['javascript:alert(1)','0x123','1'.repeat(33),'z'.repeat(44)])assert.equal(walletAddress(value,'solana'),undefined);
  assert.equal(walletAddress('https://evil.example','ethereum'),undefined);
});

test('wallet verification parser ignores other FIDs, tombstones, malformed and unknown protocols',()=>{
  assert.deepEqual(verificationWallet(verification(eth),fid),{protocol:'ethereum',address:eth});
  assert.deepEqual(verificationWallet({data:{fid,type:'MESSAGE_TYPE_VERIFICATION_ADD_ETH_ADDRESS',verificationAddEthAddressBody:{address:eth}}},fid),{protocol:'ethereum',address:eth});
  assert.deepEqual(verificationWallet(verification('0x'+'00'.repeat(31)+'01','PROTOCOL_SOLANA'),fid),{protocol:'solana',address:sol});
  for(const value of [null,{},verification(eth,9),verification('bad'),{data:{...verification(eth).data,fid:1}},{data:{...verification(eth).data,type:8}}])assert.equal(verificationWallet(value,fid),undefined);
});

test('wallet reads paginate, deduplicate, preserve cancellation and reject looping cursors',async()=>{
  const original=globalThis.fetch,abort=new AbortController();let calls=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input),'https://app.example');assert.equal(url.pathname,'/api/read/v1/verificationsByFid');assert.equal(url.searchParams.get('fid'),String(fid));assert.ok(init?.signal);calls++;
    if(!url.searchParams.has('pageToken'))return Response.json({messages:[verification(eth)],nextPageToken:'cursor+/='});
    assert.equal(url.searchParams.get('pageToken'),'cursor+/=');return Response.json({messages:[verification(eth),verification(sol,1)],nextPageToken:''});
  };
  try{
    assert.deepEqual(await readVerifiedWallets(config,fid,abort.signal),[{protocol:'ethereum',address:eth},{protocol:'solana',address:sol}]);assert.equal(calls,2);
    globalThis.fetch=async()=>Response.json({messages:[],nextPageToken:'same'});
    await assert.rejects(readVerifiedWallets(config,fid),/did not advance/);
    abort.abort();globalThis.fetch=async(_input,init)=>{throw init?.signal?.reason;};
    await assert.rejects(readVerifiedWallets(config,fid,abort.signal),{name:'AbortError'});
  }finally{globalThis.fetch=original;}
});
