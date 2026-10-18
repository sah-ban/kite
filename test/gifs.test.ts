import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared Node middleware.
import { gifSearch } from '../gifs.mjs';
import { imageEmbeds } from '../src/lib/images';
const gif='https://media.tenor.com/fixture/hello.gif',preview='https://media.tenor.com/fixture/tiny.gif';
const item=(id='1',url=gif)=>({id,content_description:'Hello GIF',media_formats:{gif:{url},tinygif:{url:preview}}});
async function call(middleware:ReturnType<typeof gifSearch>,path='/api/gifs',method='GET'){
 let status=200,body='';const res={get statusCode(){return status;},set statusCode(value){status=value;},setHeader(){},end(value:string){body=value;}};
 await middleware({url:path,method},res,()=>{throw new Error('Unexpected next');});return {status,body:JSON.parse(body)};
}
test('GIF featured/search requests use fixed provider and encode query and pagination',async()=>{
 const calls:URL[]=[];const middleware=gifSearch({fetch:async(url:URL)=>{calls.push(url);return Response.json({results:[item()],next:'cursor&x=1'});}});
 const featured=await call(middleware);assert.equal(featured.status,200);assert.deepEqual(featured.body,{items:[{id:'1',url:gif,preview,title:'Hello GIF'}],next:'cursor&x=1'});
 assert.equal(calls[0].href.split('?')[0],'https://tenor.bhopp.ing/v2/featured');assert.equal(calls[0].searchParams.get('media_filter'),'gif,tinygif');
 await call(middleware,'/api/gifs?'+new URLSearchParams({q:'cats & dogs',pos:'cursor&x=1',path:'http://evil.example'}));
 assert.equal(calls[1].hostname,'tenor.bhopp.ing');assert.equal(calls[1].pathname,'/v2/search');assert.equal(calls[1].searchParams.get('q'),'cats & dogs');assert.equal(calls[1].searchParams.get('pos'),'cursor&x=1');assert.equal(calls[1].searchParams.get('x'),null);
});
test('GIF normalization filters unsafe URLs, deduplicates results and terminates repeating cursors',async()=>{
 const middleware=gifSearch({fetch:async()=>Response.json({results:[item(),item(),item('2','https://evil.example/a.gif'),item('3','https://media.tenor.com/a.mp4'),item('4','http://media.tenor.com/a.gif'),item('5','https://media.tenor.com.evil.example/a.gif')],next:'same'})});
 const result=await call(middleware,'/api/gifs?pos=same');assert.equal(result.body.items.length,1);assert.equal(result.body.next,'');
 assert.deepEqual(imageEmbeds([gif]),[{url:gif}]);assert.equal(imageEmbeds([gif,'https://i.ibb.co/fixture/a.png']).length,2);
 assert.throws(()=>imageEmbeds([gif,gif],true));for(const url of ['https://tenor.com/view/123','https://media.tenor.com/a.mp4','https://media.tenor.com.evil.example/a.gif'])assert.throws(()=>imageEmbeds([url]));
});
test('GIF cache expires and provider errors can be retried without caching failures',async()=>{
 let time=0,calls=0,failed=false;const middleware=gifSearch({now:()=>time,fetch:async()=>{calls++;return failed?Response.json({error:'Provider detail'},{status:500}):Response.json({results:[],next:'0'});}});
 assert.equal((await call(middleware)).body.next,'');await call(middleware);assert.equal(calls,1);time=30_001;await call(middleware);assert.equal(calls,2);
 failed=true;const result=await call(middleware,'/api/gifs?q=failure');assert.equal(result.status,502);assert.ok(!JSON.stringify(result.body).includes('Provider detail'));
 failed=false;assert.equal((await call(middleware,'/api/gifs?q=failure')).status,200);
 assert.equal((await call(middleware,'/api/gifs','POST')).status,405);assert.equal((await call(middleware,'/api/gifs?q='+'x'.repeat(101))).status,400);
});
