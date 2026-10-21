import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node middleware is intentionally shared JavaScript.
import { gateway } from '../proxy.mjs';
async function request(url:string,method='GET',body=new Uint8Array(),headers:Record<string,string>={}){
  const req={url,method,headers:{host:'127.0.0.1:5173',...headers},async *[Symbol.asyncIterator](){yield body;}};
  const res={statusCode:200,headers:{} as Record<string,string>,body:undefined as unknown,setHeader(k:string,v:string){this.headers[k]=v;},end(data:unknown){this.body=data;}};
  return {req,res};
}
test('gateway fixes read destination and preserves opaque query parameters',async()=>{
  const original=globalThis.fetch;let seen='';
  globalThis.fetch=async input=>{seen=String(input);return Response.json({messages:[]});};
  try{const {req,res}=await request('/api/read/v1/castsByFid?fid=37&pageToken=x%2B%2F%3D');await gateway({HUBURL:'https://mine.example'})(req,res,()=>{});assert.equal(res.statusCode,200);assert.equal(seen,'https://mine.example/v1/castsByFid?fid=37&pageToken=x%2B%2F%3D');}
  finally{globalThis.fetch=original;}
});
test('gateway blocks unsupported read endpoints and writes on read path',async()=>{
  for(const [url,method] of [['/api/read/v1/submitMessage','GET'],['/api/read/v1/castsByFid','POST']]){const {req,res}=await request(url,method);await gateway({})(req,res,()=>{});assert.equal(res.statusCode,405);}
});
test('conversation and follower reads are allowed only on the configured read node',async()=>{
  const original=globalThis.fetch;const calls:string[]=[];
  globalThis.fetch=async input=>{calls.push(String(input));return Response.json({messages:[]});};
  try{for(const endpoint of ['castsByParent','castsByMention','reactionsByCast','linksByTargetFid','userNameProofByName','verificationsByFid']){
    const {req,res}=await request(`/api/read/v1/${endpoint}?fid=37&pageToken=opaque%2B%2F%3D`);
    await gateway({HUBURL:'https://mine.example'})(req,res,()=>{});assert.equal(res.statusCode,200);
    assert.equal(calls.at(-1),`https://mine.example/v1/${endpoint}?fid=37&pageToken=opaque%2B%2F%3D`);
  }}finally{globalThis.fetch=original;}
});
test('default node supports submissions without a separate endpoint setting',async()=>{
  const original=globalThis.fetch;let seen='';
  globalThis.fetch=async input=>{seen=String(input);return Response.json({accepted:true});};
  try{const {req,res}=await request('/api/write/v1/submitMessage','POST');await gateway({})(req,res,()=>{});assert.equal(res.statusCode,200);assert.equal(seen,'http://127.0.0.1:3381/v1/submitMessage');}
  finally{globalThis.fetch=original;}
});
test('cross-origin writes are rejected',async()=>{
  const {req,res}=await request('/api/write/v1/submitMessage','POST',new Uint8Array(),{origin:'https://attacker.example'});await gateway({HUBURL:'https://node.example'})(req,res,()=>{});assert.equal(res.statusCode,403);
});
test('browser configuration exposes gateway paths rather than upstream endpoints',async()=>{
  const {req,res}=await request('/api/config');
  await gateway({HUBURL:'https://private-node.example',DATABASE_URL:'postgres://private-db.example/freecast',FREECAST_FEED_FIDS:'268438',FREECAST_FEED_GRPC_URL:'https://private-stream.example:3383',FREECAST_FEED_HTTP_URL:'https://private-feed.example'})(req,res,()=>{});
  const config=JSON.parse(String(res.body));
  assert.equal(config.readUrl,'/api/read');
  assert.ok(!('validatorUrl' in config));
  assert.ok(!String(res.body).includes('private-node.example'));
  assert.equal(config.indexedFeedEnabled,true);assert.deepEqual(config.indexedFeedFids,[268438]);assert.equal(config.defaultFeedFid,268438);
  for(const privateHost of ['private-db.example','private-stream.example','private-feed.example'])assert.ok(!String(res.body).includes(privateHost));
});
test('protobuf submissions and reads use the same configured node',async()=>{
  const original=globalThis.fetch;let seen='',payload:unknown;
  globalThis.fetch=async(input,init)=>{seen=String(input);payload=init?.body;assert.equal((init?.headers as Record<string,string>)['Content-Type'],'application/octet-stream');return Response.json({hash:'0x123'});};
  try{const {req,res}=await request('/api/write/v1/submitMessage','POST',new Uint8Array([1,2,3]),{origin:'http://127.0.0.1:5173'});await gateway({HUBURL:'https://node.example'})(req,res,()=>{});assert.equal(seen,'https://node.example/v1/submitMessage');assert.deepEqual([...payload as Uint8Array],[1,2,3]);assert.equal(res.statusCode,200);}
  finally{globalThis.fetch=original;}
});
test('HTTPS writes accept the configured origin and reject forged hosts and origins',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({hash:'0x123'});};
  const middleware=gateway({HUBURL:'https://node.example',FREECAST_PUBLIC_URL:'https://client.example:8443'});
  try {
    for(const [host,origin,status] of [['client.example:8443','https://client.example:8443',200],['client.example:8443','http://client.example:8443',403],['attacker.example','https://client.example:8443',403]] as const){
      const {req,res}=await request('/api/write/v1/submitMessage','POST',new Uint8Array([1]),{host,origin});
      await middleware(req,res,()=>{});assert.equal(res.statusCode,status);
    }
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('local writes use their exact loopback origin even when a hosted public URL is configured',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({ok:true});};
  const middleware=gateway({HUBURL:'https://node.example',FREECAST_PUBLIC_URL:'https://client.example:8443'});
  try{
    for(const [host,origin,peer,status] of [
      ['localhost:5173','http://localhost:5173','127.0.0.1',200],
      ['127.0.0.1:5173','http://127.0.0.1:5173','::ffff:127.0.0.1',200],
      ['[::1]:5173','http://[::1]:5173','::1',200],
      ['localhost:5173','https://attacker.example','127.0.0.1',403],
      ['localhost:5173','http://127.0.0.1:5173','127.0.0.1',403],
      ['localhost:5173','http://localhost:5174','127.0.0.1',403],
      ['localhost:5173','http://localhost:5173','192.0.2.1',403],
      ['192.0.2.1:5173','http://192.0.2.1:5173','127.0.0.1',403],
    ] as const){
      const {req,res}=await request('/api/write/v1/submitMessage','POST',new Uint8Array([1]),{host,origin});
      (req as any).socket={remoteAddress:peer};
      await middleware(req,res,()=>{});assert.equal(res.statusCode,status,`${host}, ${origin}, ${peer}`);
    }
    assert.equal(calls,3);
  }finally{globalThis.fetch=original;}
});
