import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
// @ts-expect-error Server-only worker diagnostics.
import {NodeReadError,workerError,workerDiagnostics} from '../feed/diagnostics.mjs';

test('worker diagnostics identify HTTP, network, database and stream failures without leaking upstream details',()=>{
  const secret='https://operator:private-password@private-node.example/path?token=private-token';
  const network=Object.assign(new Error('Cannot reach '+secret),{code:'ECONNREFUSED'});
  const denied=new NodeReadError('castsByFid',{status:403,cause:new Error(secret)});
  assert.equal(workerError(denied),'castsByFid: HTTP 403');
  assert.equal(workerError(new NodeReadError('info',{cause:new TypeError('fetch failed',{cause:network})})),'info: ECONNREFUSED');
  assert.equal(workerError(new NodeReadError('signersByFid',{invalidJson:true,cause:new SyntaxError(secret)})),'signersByFid: invalid JSON response');
  const both=new AggregateError([new NodeReadError('onChainSignersByFid',{status:404}),new NodeReadError('signersByFid',{cause:new DOMException(secret,'TimeoutError')})],'Signer sync unavailable');
  assert.equal(workerError(both),'signer sync unavailable (onChainSignersByFid: HTTP 404; signersByFid: request timed out)');
  assert.match(workerError(Object.assign(new Error(secret),{code:'28P01'})),/PostgreSQL 28P01: authentication failed/);
  assert.equal(workerError(Object.assign(new Error(secret),{code:14,details:secret})),'gRPC status 14');
  assert.equal(workerError(new Error(secret)),'unexpected error');
  assert.equal(workerError(new Error('A feed worker is already running')),'A feed worker is already running');
  assert.equal(workerError(new Error('timeout exceeded when trying to connect')),'database connection timed out');
  assert.equal(workerError(new Error('Connection terminated due to connection timeout')),'database connection timed out');
  assert.equal(workerError(new Error('Connection terminated unexpectedly')),'database connection terminated unexpectedly');
  const circular:any=new Error(secret);circular.cause=circular;
  for(const error of [denied,network,both,circular,new NodeReadError(secret,{cause:new Error(secret)}),Object.assign(new Error(secret),{code:secret})]){
    const result=workerError(error);assert.ok(!result.includes('private-'));assert.ok(!result.includes('https://'));assert.ok(result.length<300);
  }
});

test('worker diagnostics bound repeated failures, log changed failures immediately and report recovery',()=>{
  let time=0;const logs:string[]=[];
  const diagnostics=workerDiagnostics((line:string)=>logs.push(line),{now:()=>time,interval:300000,maxEntries:2});
  const error=new NodeReadError('castsByFid',{status:503});
  diagnostics.failure('author:10','Feed author FID 10 cast history failed',error);
  time=30000;diagnostics.failure('author:10','Feed author FID 10 cast history failed',error);assert.equal(logs.length,1);
  diagnostics.failure('author:10','Feed author FID 10 cast history failed',new NodeReadError('castsByFid',{status:400}));assert.equal(logs.length,2);
  time+=300000;diagnostics.failure('author:10','Feed author FID 10 cast history failed',new NodeReadError('castsByFid',{status:400}));assert.equal(logs.length,3);
  diagnostics.recovered('author:10','Feed author FID 10 indexing recovered');assert.equal(logs.at(-1),'Feed author FID 10 indexing recovered');
  diagnostics.failure('author:10','Feed author FID 10 cast history failed',error);assert.equal(logs.length,5);
  diagnostics.failure('author:20','Feed author FID 20 cast history failed',error);
  diagnostics.failure('author:30','Feed author FID 30 cast history failed',error);
  diagnostics.failure('author:10','Feed author FID 10 cast history failed',error);assert.equal(logs.length,8,'oldest entry was evicted');
});

test('worker CLI explains startup configuration failure without printing configured credentials',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kite-worker-startup-'));
  try{
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../feed/worker.mjs',import.meta.url))],{
      cwd:directory,encoding:'utf8',timeout:15000,
      env:{PATH:process.env.PATH,DATABASE_URL:'postgresql://operator:private-password@private-node.example/kite',KITE_FEED_GRPC_URL:'invalid-url'},
    });
    assert.equal(result.status,1,result.error?.message);
    assert.match(result.stderr,/Feed worker could not start: Invalid feed gRPC URL/);
    assert.ok(!result.stderr.includes('private-'));
    assert.ok(!result.stderr.includes('postgresql://'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
