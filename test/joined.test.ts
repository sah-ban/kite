import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared server middleware.
import { earliestFnameTimestamp, joinedDates } from '../joined.mjs';
async function call(middleware:ReturnType<typeof joinedDates>,path='/api/profile/joined?fid=37',method='GET'){
 let status=200,body='';const res={get statusCode(){return status;},set statusCode(value){status=value;},setHeader(){},end(value:string){body=value;}};
 await middleware({url:path,method},res,()=>{throw new Error('Unexpected next');});return {status,body:JSON.parse(body)};
}
test('joined timestamp uses earliest incoming fname event, ignoring outgoing, unrelated and invalid dates',()=>{
 assert.equal(earliestFnameTimestamp([{to:37,timestamp:200},{from:37,to:0,timestamp:1},{to:88,timestamp:2},{to:37,timestamp:100},{to:37,timestamp:999},{to:37,timestamp:'3'},{to:37,timestamp:-1}],37,500),100);
 assert.equal(earliestFnameTimestamp([],37),null);
});
test('joined history paginates a fixed provider, chooses the earliest date and shares cached requests',async()=>{
 const calls:URL[]=[];const middleware=joinedDates({now:()=>500_000,fetch:async(url:URL)=>{
  calls.push(url);const page=url.searchParams.get('from_id');
  return Response.json({transfers:!page?[{id:5,to:37,timestamp:200},{id:3,to:37,timestamp:300}]:page==='6'?[{id:8,to:37,timestamp:100}]:[]});
 }});
 const [first,second]=await Promise.all([call(middleware),call(middleware)]);assert.deepEqual(first.body,{timestamp:100});assert.deepEqual(second.body,first.body);assert.equal(calls.length,3);
 assert.equal(calls[0].origin,'https://fnames.farcaster.xyz');assert.equal(calls[0].pathname,'/transfers');assert.equal(calls[0].searchParams.get('fid'),'37');assert.equal(calls[2].searchParams.get('from_id'),'9');
 await call(middleware);assert.equal(calls.length,3);
});
test('empty histories stay unknown; failures are retryable and invalid cursors do not produce partial dates',async()=>{
 let mode='empty',calls=0;const middleware=joinedDates({fetch:async()=>{calls++;return mode==='empty'?Response.json({transfers:[]}):mode==='fail'?Response.json({error:'Provider detail'},{status:500}):Response.json({transfers:[{id:1,to:88,timestamp:100}]});}});
 assert.deepEqual((await call(middleware)).body,{timestamp:null});
 mode='fail';const failed=await call(middleware,'/api/profile/joined?fid=88');assert.equal(failed.status,502);assert.ok(!JSON.stringify(failed.body).includes('Provider detail'));
 mode='bad';assert.equal((await call(middleware,'/api/profile/joined?fid=88')).status,502);
 mode='empty';assert.equal((await call(middleware,'/api/profile/joined?fid=88')).status,200);
 const before=calls;for(const fid of ['0','-1','abc','1.5','9007199254740992'])assert.equal((await call(middleware,'/api/profile/joined?fid='+fid)).status,400);assert.equal((await call(middleware,'/api/profile/joined?fid=37','POST')).status,405);assert.equal(calls,before);
});
