import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error Shared HTML metadata.
import {pageMetadata,metadataOrigin,renderPageMetadata} from '../page-metadata.mjs';
// @ts-expect-error Production static handler.
import {staticFiles} from '../static.mjs';

test('social crawlers receive distinct client and guide cards without executing JavaScript',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kite-social-'));
  try{
    await writeFile(join(directory,'index.html'),await readFile(new URL('../index.html',import.meta.url)));
    const serve=staticFiles(directory,{KITE_PUBLIC_URL:'https://kite.example'});
    for(const path of ['/','/guide','/guide/']){
      let status=200,body='';const headers:Record<string,string>={};
      await serve({url:path,method:'GET',headers:{host:'internal:3000'}},{setHeader(name:string,value:string){headers[name]=value;},set statusCode(value:number){status=value;},end(value:string){body=value;}});
      assert.equal(status,200);assert.equal(headers['Content-Type'],'text/html');
      const guide=path.startsWith('/guide'),image=`https://kite.example/og-${guide?'guide':'client'}.png`;
      assert.ok(body.includes(`<meta property="og:image" content="${image}">`));
      assert.ok(body.includes(`<meta name="twitter:image" content="${image}">`));
      assert.ok(body.includes('content="summary_large_image"'));
      assert.ok(body.includes(`<meta property="og:url" content="https://kite.example${guide?'/guide':'/'}">`));
      assert.equal((body.match(/property="og:image"/g)||[]).length,1);
      assert.equal((body.match(/<title>/g)||[]).length,1);
      assert.equal(body.includes('<title>Kite Guide'),guide);
      assert.ok(!body.includes('internal:3000'));
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('metadata respects public origins, HTTPS proxies and safe HTML escaping',()=>{
  assert.equal(metadataOrigin({headers:{host:'kite.example','x-forwarded-proto':'https, http'}}),'https://kite.example');
  assert.equal(metadataOrigin({headers:{host:'localhost:5173'}}),'http://localhost:5173');
  assert.equal(metadataOrigin({headers:{host:'internal'}},{KITE_PUBLIC_URL:'https://kite.example/'}),'https://kite.example');
  assert.throws(()=>metadataOrigin({headers:{}},{KITE_PUBLIC_URL:'https://user:secret@kite.example'}));
  assert.equal(pageMetadata('/client/','https://kite.example').url,'https://kite.example/');
  assert.equal(pageMetadata('/guide/missing').image,'/og-client.png');
  const html='<!-- kite:metadata:start --><!-- kite:metadata:end -->';
  assert.ok(renderPageMetadata(html,'/"<unsafe>','https://kite.example').includes('%22%3Cunsafe%3E'));
});

test('both social images are PNGs with 1200 by 630 dimensions',async()=>{
  for(const name of ['client','guide']){
    const png=await readFile(new URL(`../public/og-${name}.png`,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  }
});
