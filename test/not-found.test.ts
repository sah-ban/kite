import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {clientRoute,isGuidePath} from '../src/lib/routes';
// @ts-expect-error Shared production routing.
import {isPagePath,isEndorsementsPath} from '../routing.mjs';
// @ts-expect-error Server-only static handler.
import {staticFiles} from '../static.mjs';
const hash='0x'+'ab'.repeat(20);
const valid=['/','/index.html','/client','/client/','/following','/following/','/search','/search/','/settings/','/notifications/','/profile/37','/profile/37/about/','/profile/37/followers','/profile/37/following/',`/cast/37/${hash}/`];
const invalid=['/missing','/missing/deep','/guide/missing','/settings/extra','/search/extra','/profile/0','/profile/-1','/profile/9007199254740992','/profile/37/unknown','/cast/37/0xshort',`/cast/0/${hash}`,'/%73earch'];
test('client and server agree on explicit page routes, trailing slashes and unknown paths',()=>{
 for(const path of valid){assert.notEqual(clientRoute(path).kind,'not-found',path);assert.equal(isPagePath(path),true,path);}
 for(const path of invalid){assert.deepEqual(clientRoute(path,'?fid=37'),{kind:'not-found'},path);assert.equal(isPagePath(path),false,path);}
 for(const path of ['/guide','/guide/']){assert.equal(isGuidePath(path),true);assert.equal(isPagePath(path),true);}
 for(const path of ['/endorsements','/endorsements/']){assert.equal(isEndorsementsPath(path),true);assert.equal(isPagePath(path),true);}
 assert.equal(isPagePath('/endorsements/missing'),false);
 assert.equal(isGuidePath('/guide/missing'),false);
 assert.deepEqual(clientRoute('/following/','?fid=268438'),{kind:'following',feedFid:268438});
 assert.deepEqual(clientRoute(`/cast/37/${hash}`,'?tab=recasts'),{kind:'cast',fid:37,hash,tab:'recasts'});
});
test('static server returns branded HTML with real 404 status while preserving routes, assets and API errors',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kite-404-')),root=join(directory,'dist');
 try{
  await mkdir(join(root,'assets'),{recursive:true});await writeFile(join(root,'index.html'),'<!doctype html><title>Kite</title><div id="root"></div>');await writeFile(join(root,'assets','app.js'),'console.log("Kite")');await writeFile(join(directory,'secret'),'private fixture');
  const serve=staticFiles(root);
  async function call(url:string,accept='',method='GET'){
   let status=200,body='';const headers:Record<string,string>={};
   await serve({url,method,headers:{accept}},{setHeader:(name:string,value:string)=>headers[name.toLowerCase()]=String(value),set statusCode(value:number){status=value;},end:(value?:string|Buffer)=>{body=value?.toString()||'';}});
   return {status,body,headers};
  }
  for(const path of [...valid,'/guide','/guide/','/endorsements','/endorsements/']){const response=await call(path,'text/html');assert.equal(response.status,200,path);assert.ok(response.body.includes('id="root"'));assert.equal(response.headers['cache-control'],'no-cache');}
  for(const path of [...invalid,'/missing.page','/index.html/','/assets/app.js/']){const response=await call(path,'text/html');assert.equal(response.status,404,path);assert.ok(response.body.includes('id="root"'),path);assert.equal(response.headers['content-type'],'text/html');}
  const asset=await call('/assets/app.js');assert.equal(asset.status,200);assert.equal(asset.headers['content-type'],'text/javascript');assert.equal(asset.body,'console.log("Kite")');assert.equal(asset.headers['x-content-type-options'],'nosniff');
  for(const path of ['/assets/missing.js','/missing.png','/api/missing','/api']){const response=await call(path);assert.equal(response.status,404);assert.equal(response.headers['content-type'],'text/plain');assert.ok(!response.body.includes('<html'));}
  assert.equal((await call('/api/missing','text/html')).body,'Unknown endpoint');
  const head=await call('/missing','text/html','HEAD');assert.equal(head.status,404);assert.equal(head.body,'');assert.equal(head.headers['content-type'],'text/html');
  const post=await call('/','text/html','POST');assert.equal(post.status,405);assert.equal(post.headers.allow,'GET, HEAD');
  assert.equal((await call('/%E0%A4%A')).status,400);
  const traversal=await call('/%2e%2e%2fsecret');assert.equal(traversal.status,403);assert.ok(!traversal.body.includes('private fixture'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('missing production build is a generic server failure, not a successful route or leaked path',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kite-empty-build-'));
 try{let status=200,body='';await staticFiles(directory)({url:'/',method:'GET',headers:{}},{setHeader(){},set statusCode(code:number){status=code;},end(value:string){body=value;}});assert.equal(status,500);assert.equal(body,'Unable to load this page');assert.ok(!body.includes(directory));}
 finally{await rm(directory,{recursive:true,force:true});}
});
