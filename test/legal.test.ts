import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Shared public policy documents.
import {legalDocuments,renderLegalContent} from '../legal.mjs';
// @ts-expect-error Shared production routing.
import {legalPagePath,isPagePath} from '../routing.mjs';
// @ts-expect-error Shared HTML metadata.
import {pageMetadata} from '../page-metadata.mjs';
// @ts-expect-error Production static handler.
import {staticFiles} from '../static.mjs';

test('policy routes are exact, canonical, and readable in production HTML without JavaScript',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kite-policies-'));
  try{
    await writeFile(join(directory,'index.html'),await readFile(new URL('../index.html',import.meta.url)));
    const serve=staticFiles(directory,{KITE_PUBLIC_URL:'https://kite.example'});
    for(const name of Object.keys(legalDocuments))for(const suffix of ['','/']){
      const path=`/${name}${suffix}`;assert.equal(isPagePath(path),true);assert.equal(legalPagePath(path),name);
      const meta=pageMetadata(path,'https://kite.example');assert.equal(meta.url,`https://kite.example/${name}`);
      let status=0,body='';const headers:Record<string,string>={};
      await serve({url:path,method:'GET',headers:{host:'internal'}},{setHeader:(key:string,value:string)=>headers[key]=value,set statusCode(value:number){status=value;},end(value:string){body=String(value);}});
      assert.equal(status,200);assert.equal(headers['Content-Type'],'text/html');assert.equal(headers['Cache-Control'],'no-cache');
      assert.ok(body.includes(`<h1>${legalDocuments[name].title}</h1>`));assert.ok(body.includes('mailto:kite@sahban.dev'));
      assert.ok(body.includes(`<title>${legalDocuments[name].title} — Kite</title>`));assert.equal((body.match(/<main /g)||[]).length,1);
      assert.ok(!body.includes('internal'));assert.ok(!body.includes('Loading Kite'));
    }
  }finally{await rm(directory,{recursive:true,force:true});}
  for(const path of ['/privacy/missing','/terms/extra','/data-deletion.json','/community-guidelines/extra']){assert.equal(isPagePath(path),false);assert.equal(legalPagePath(path),undefined);}
  for(const name of ['missing','__proto__','toString'])assert.equal(renderLegalContent(name),'');
});

test('policies distinguish current controls, device keys, server-held sessions and public network deletion',()=>{
  const privacy=renderLegalContent('privacy'),guidelines=renderLegalContent('community-guidelines'),deletion=renderLegalContent('data-deletion');
  assert.ok(privacy.includes('private key is encrypted on the Kite server'));
  assert.ok(privacy.includes('Android Keystore-backed encryption'));
  assert.ok(privacy.includes('does not delete its hosted ImgBB image'));
  assert.ok(guidelines.includes('In-app reporting and personal user blocking are not yet available'));
  assert.ok(guidelines.includes('does not provide a protocol-wide blocking command'));
  assert.ok(deletion.includes('do not delete your FID or custody wallet'));
});
