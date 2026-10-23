import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Server-only minimal node status.
import {nodeStatus} from '../node-status.mjs';
import {getNodeStatus} from '../src/lib/hub';

async function call(handler:any,method='GET'){
  const response={statusCode:200,headers:{} as Record<string,string>,body:'',setHeader(name:string,value:string){this.headers[name]=value;},end(body:string){this.body=body;}};
  await handler({method},response);
  return {...response,value:JSON.parse(response.body)};
}

test('public status exposes only availability and aggregate delay, with shared short-lived caching',async()=>{
  let time=0,calls=0;
  const handler=nodeStatus({HUBURL:'https://private-node.example:3381'},{now:()=>time,fetcher:async(url:URL,options:RequestInit)=>{
    calls++;assert.equal(url.href,'https://private-node.example:3381/v1/info');assert.equal(options.redirect,'error');
    return Response.json({peer_id:'private-peer',version:'private-version',dbStats:{numMessages:123456,dbSize:99999},address:'private-address',shardInfos:[{shardId:17,maxHeight:123456,blockDelay:2.2},{shardId:23,maxHeight:999999,blockDelay:7.1}]});
  }});
  const results=await Promise.all([call(handler),call(handler)]);
  assert.equal(calls,1);
  for(const result of results){assert.equal(result.statusCode,200);assert.deepEqual(result.value,{available:true,syncDelaySeconds:8});assert.equal(result.headers['Cache-Control'],'no-store');assert.ok(!result.body.includes('private-'));}
  await call(handler);assert.equal(calls,1);
  time=5001;await call(handler);assert.equal(calls,2);
});

test('node errors never return upstream bodies, addresses or error messages',async()=>{
  const responses=[
    ()=>Response.json({peer_id:'private-peer',error:'https://private-node.example'},{status:403}),
    ()=>new Response('private-peer invalid JSON'),
    ()=>Response.json({peer_id:'private-peer'}),
    ()=>{throw new Error('Connection to https://private-node.example failed: private-peer');},
  ];
  for(const fetcher of responses){
    const result=await call(nodeStatus({},{fetcher}));
    assert.equal(result.statusCode,503);assert.deepEqual(result.value,{available:false,syncDelaySeconds:null});assert.ok(!result.body.includes('private-'));
  }
});

test('missing or invalid shard delays remain unknown and status is read-only',async()=>{
  for(const shardInfos of [[],[{blockDelay:-1}],[{blockDelay:'5'}],[{blockDelay:null}],[{blockDelay:0},{}]]){
    const result=await call(nodeStatus({},{fetcher:async()=>Response.json({shardInfos})}));
    assert.equal(result.statusCode,200);assert.deepEqual(result.value,{available:true,syncDelaySeconds:null});
  }
  const result=await call(nodeStatus({},{fetcher:()=>{throw Error('Must not fetch');}}),'POST');
  assert.equal(result.statusCode,405);assert.equal(result.headers.Allow,'GET');
});

test('client connection checks use the minimal endpoint and discard extra response fields',async()=>{
  const original=globalThis.fetch;let endpoint='';
  try{
    globalThis.fetch=async input=>{endpoint=String(input);return Response.json({available:true,syncDelaySeconds:3,peer_id:'private-peer',version:'private-version'});};
    assert.deepEqual(await getNodeStatus(),{available:true,syncDelaySeconds:3});assert.equal(endpoint,'/api/node/status');
    globalThis.fetch=async()=>Response.json({error:'private-peer private-node.example'},{status:503});
    await assert.rejects(getNodeStatus(),error=>error instanceof Error&&error.message==='The node is unavailable. Please try again.');
  }finally{globalThis.fetch=original;}
});
