import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {enrollFollowing} from '../src/lib/indexed-feed';
import {NobleEd25519Signer} from '@farcaster/core';
// @ts-expect-error Server-only local proof verification.
import {localFeedEnrollment} from '../feed/enrollment.mjs';
// @ts-expect-error Server-only database.
import {createPool,migrate,enrollViewer,replaceFollows,saveCast,queryFeed,parseFeedQuery} from '../feed/store.mjs';
// @ts-expect-error Server-only public API.
import {indexedFeed} from '../feed/api.mjs';
const signer=new NobleEd25519Signer(new Uint8Array(32).fill(7));
const key='0x'+Buffer.from((await signer.getSignerKey())._unsafeUnwrap()).toString('hex');
const config={FREECAST_PUBLIC_URL:'https://freecast.example',FREECAST_FEED_HTTP_URL:'https://node.example'};
function request(path:string,body?:unknown,extra:any={}){return {url:path,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:5173',origin:'http://127.0.0.1:5173'},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));},...extra};}
async function proof(now=1000,source:any=1){let time=now,calls=0;const enrolled:number[]=[];
  const handler=localFeedEnrollment(config,async(fid:number)=>{enrolled.push(fid);return {enrolled:true,fid};},{now:()=>time,fetcher:async()=>{calls++;return Response.json({signers:[{fid:123,key,keyType:1,source,expiresAt:100000,scopes:[1]}]});}});
  async function challenge(fid=123){const url=new URL('/api/feed/challenge?'+new URLSearchParams({fid:String(fid),key}),'http://127.0.0.1:5173');return handler(request(url.pathname+url.search),{},url);}
  async function signed(challenge:any){return {nonce:challenge.nonce,signature:'0x'+Buffer.from((await signer.signMessageHash(createHash('sha256').update(challenge.message).digest()))._unsafeUnwrap()).toString('hex')};}
  async function submit(body:any,extra:any={}){return handler(request('/api/feed/enroll',body,extra),{},new URL('http://127.0.0.1:5173/api/feed/enroll'));}
  return {challenge,signed,submit,enrolled,get calls(){return calls;},advance:(ms:number)=>{time+=ms;}};
}
test('local enrollment proves an active signer, binds FID, and prevents replay',async()=>{
  const h=await proof(),challenge=await h.challenge(),body=await h.signed(challenge);
  assert.equal((await h.submit({...body,fid:999})).fid,123);assert.deepEqual(h.enrolled,[123]);assert.equal(h.calls,1);
  await assert.rejects(h.submit(body),/expired/);
  const other=await h.challenge(999);await assert.rejects(h.submit(await h.signed(other)),/not registered/);assert.deepEqual(h.enrolled,[123]);
});
test('local enrollment rejects forgery, expiry, foreign origins, and hosted callers',async()=>{
  const h=await proof();let challenge=await h.challenge();await assert.rejects(h.submit({nonce:challenge.nonce,signature:'0x'+'00'.repeat(64)}),/Invalid enrollment signature/);
  challenge=await h.challenge();const body=await h.signed(challenge);h.advance(120001);await assert.rejects(h.submit(body),/expired/);
  challenge=await h.challenge();const valid=await h.signed(challenge);
  await assert.rejects(h.submit(valid,{headers:{host:'127.0.0.1:5173',origin:'https://attacker.example'}}),/Origin mismatch/);
  await assert.rejects(h.submit(valid,{headers:{host:'freecast.example',origin:'https://freecast.example'},socket:{remoteAddress:'192.0.2.1'}}),/delegated/);
  assert.equal(h.calls,0);assert.deepEqual(h.enrolled,[]);
});
test('local gasless enrollment checks expiry and requested account registration',async()=>{
  const active=await proof(1000,2);const challenge=await active.challenge();await active.submit(await active.signed(challenge));assert.deepEqual(active.enrolled,[123]);
  const expired=await proof(100001000,2);const old=await expired.challenge();await assert.rejects(expired.submit(await expired.signed(old)),/expired/);
});
test('database enrollment is idempotent, limits new viewers, reuses authors, and enables public reads', {skip:!process.env.FREECAST_TEST_DATABASE_URL},async()=>{
  const schema='enroll_test_'+randomBytes(6).toString('hex'),admin=createPool(process.env.FREECAST_TEST_DATABASE_URL);await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool(process.env.FREECAST_TEST_DATABASE_URL,{options:'-c search_path='+schema});
  try{await migrate(pool);await enrollViewer(pool,123,{maxUsers:2});await enrollViewer(pool,123,{maxUsers:2});await enrollViewer(pool,456,{maxUsers:2});
    await assert.rejects(enrollViewer(pool,789,{maxUsers:2}),/capacity/);await enrollViewer(pool,123,{maxUsers:1});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_users')).rows[0].n,2);
    await replaceFollows(pool,123,[10]);await replaceFollows(pool,456,[10]);
    await saveCast(pool,{hash:'0x'+'11'.repeat(20),signer:key,data:{fid:10,timestamp:1234,castAddBody:{text:'Shared author',mentions:[],mentionsPositions:[],embeds:[]}}});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_authors')).rows[0].n,1);
    for(const fid of [123,456])assert.equal((await queryFeed(pool,parseFeedQuery(new URLSearchParams({fid:String(fid)})))).messages.length,1);
    const api=indexedFeed({DATABASE_URL:'configured'},{pool});
    async function call(path:string){let status=200,body:any;await api(request(path),{setHeader(){},set statusCode(value:number){status=value;},end(value:string){body=JSON.parse(value);}},()=>{throw Error('Unexpected next');});return {status,body};}
    assert.equal((await call('/api/feed/enrollment?fid=123')).body.enrolled,true);
    assert.equal((await call('/api/feed/enrollment?fid=789')).body.enrolled,false);
    assert.equal((await call('/api/feed/following?fid=789')).status,404);
    assert.equal((await call('/api/feed/following?fid=456')).body.messages.length,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM freecast_feed_users')).rows[0].n,2,'anonymous reads cannot enroll arbitrary FIDs');
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});

test('local client enrollment signs the server challenge and sends only nonce and proof',async()=>{
  const h=await proof(),previous=globalThis.fetch;const paths:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const path=String(input);paths.push(path);
    if(path.startsWith('/api/feed/challenge?'))return Response.json(await h.challenge());
    const body=JSON.parse(String(init?.body));assert.deepEqual(Object.keys(body).sort(),['nonce','signature']);return Response.json(await h.submit(body));
  };
  try{await enrollFollowing({fid:123,address:'0x0000000000000000000000000000000000000001',key:key as `0x${string}`,signer});assert.deepEqual(h.enrolled,[123]);assert.equal(paths.length,2);}
  finally{globalThis.fetch=previous;}
});
