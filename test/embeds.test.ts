import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
// @ts-expect-error Shared server middleware is JavaScript.
import { embedPreviews, isPublicAddress, loadDocument, parseMetadata, publicDestination } from '../embeds.mjs';
import { classifyEmbed, embedURL } from '../src/lib/embeds';

const publicLookup=async()=>[{address:'93.184.216.34',family:4}];
type Route={status?:number;type?:string;body?:string;location?:string};
function transport(route:(url:URL)=>Route) {
  const calls:{url:URL;options:any;response?:PassThrough}[]=[];
  const request=(url:URL,options:any,callback:(res:any)=>void)=>{
    const record:{url:URL;options:any;response?:PassThrough}={url,options};calls.push(record);
    const req=new EventEmitter() as any;
    req.destroy=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const item=route(url),response=new PassThrough() as any;record.response=response;
      response.statusCode=item.status||200;response.headers={'content-type':item.type||'text/html',...(item.location?{location:item.location}:{})};
      callback(response);if(!response.destroyed)response.end(item.body||'<head><title>Preview</title></head>');
    });return req;
  };return {request,calls};
}
async function call(middleware:any,url:string,method='GET') {
  const req={url:'/api/embed?'+new URLSearchParams({url}),method,socket:{remoteAddress:'127.0.0.1'},headers:{cookie:'kite_session=do-not-forward',authorization:'do-not-forward'}};
  const res={statusCode:200,headers:{} as Record<string,string>,body:'',setHeader(key:string,value:string){this.headers[key]=value;},end(value:string){this.body=value;}};
  await middleware(req,res,()=>assert.fail('Unexpected middleware fallthrough'));
  return {status:res.statusCode,body:JSON.parse(res.body)};
}
test('media classification handles signed URLs, extensionless images, HLS, and supported video providers',()=>{
  assert.equal(classifyEmbed('https://cdn.example/picture.JPG?signature=abc')?.kind,'image');
  assert.equal(classifyEmbed('https://cdn.example/movie.mp4?token=abc')?.kind,'video');
  assert.equal(classifyEmbed('https://stream.example/video/index.m3u8')?.kind,'video');
  assert.equal(classifyEmbed('https://imagedelivery.net/account/image/public')?.kind,'image');
  assert.deepEqual(classifyEmbed('https://youtu.be/dQw4w9WgXcQ'),{kind:'youtube',url:'https://youtu.be/dQw4w9WgXcQ',id:'dQw4w9WgXcQ'});
  assert.equal(classifyEmbed('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')?.kind,'link');
  assert.equal(classifyEmbed('https://vimeo.com/1234567')?.kind,'vimeo');
  assert.equal(embedURL('javascript:alert(1)'),undefined);assert.equal(embedURL('https://user:password@example.com'),undefined);
});
test('preview destinations reject private, local, special, and mapped addresses',async()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','172.18.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('93.184.216.34'),true);assert.equal(isPublicAddress('2606:4700::1111'),true);
  for(const url of ['http://localhost','http://127.1','http://2130706433','http://[::ffff:127.0.0.1]','http://169.254.169.254/latest/meta-data','https://example.com:3381','file:///etc/passwd','https://user:secret@example.com'])await assert.rejects(publicDestination(url,publicLookup));
  await assert.rejects(publicDestination('https://mixed.example',async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]));
});
test('validated DNS is pinned to the actual connection and no caller credentials are forwarded',async()=>{
  const t=transport(()=>({}));let lookups=0;
  const middleware=embedPreviews({request:t.request,lookup:async()=>{lookups++;return lookups===1?await publicLookup():[{address:'127.0.0.1',family:4}];}});
  assert.equal((await call(middleware,'https://public.example/article')).status,200);
  let pinned:any;t.calls[0].options.lookup('public.example',{},(_error:any,address:string,family:number)=>{pinned={address,family};});
  assert.deepEqual(pinned,{address:'93.184.216.34',family:4});assert.equal(lookups,1);
  assert.equal(t.calls[0].options.headers.cookie,undefined);assert.equal(t.calls[0].options.headers.authorization,undefined);
});
test('redirects are revalidated and cannot reach internal services',async()=>{
  const t=transport(()=>({status:302,location:'http://169.254.169.254/latest/meta-data'}));
  await assert.rejects(loadDocument('https://public.example/start',{request:t.request,lookup:publicLookup}));assert.equal(t.calls.length,1);
  const loop=transport(()=>({status:302,location:'/again'}));
  await assert.rejects(loadDocument('https://public.example/start',{request:loop.request,lookup:publicLookup}),/redirects/);assert.equal(loop.calls.length,4);
});
test('metadata decodes entities and resolves relative assets without missing-image placeholders',()=>{
  const metadata=parseMetadata(`<html><head><title>Fallback &amp; title</title><meta content="A &quot;quoted&quot; title" property="og:title"><meta name='description' content='Description &amp; details'><meta property="og:image" content="/cover.png"><meta property="og:video" content="/clip.mp4"><meta property="og:video:type" content="video/mp4"></head></html>`,'https://public.example/article');
  assert.equal(metadata.title,'A "quoted" title');assert.equal(metadata.description,'Description & details');assert.equal(metadata.image,'https://public.example/cover.png');assert.equal(metadata.video,'https://public.example/clip.mp4');
  const empty=parseMetadata('<head><title>Just a title</title></head>','https://public.example/article');assert.equal(empty.image,undefined);assert.equal(empty.video,undefined);
  assert.equal(parseMetadata('<meta property="og:image" content="javascript:alert(1)">','https://public.example').image,undefined);
});
test('preview responses classify extensionless media, cache repeated URLs, and exclude private metadata assets',async()=>{
  const t=transport(url=>url.pathname==='/image'?{type:'image/webp'}:{body:'<head><title>Safe</title><meta property="og:image" content="http://10.0.0.1/private.png"></head>'});
  const middleware=embedPreviews({request:t.request,lookup:publicLookup});
  const first=await call(middleware,'https://public.example/image');assert.equal(first.body.kind,'image');assert.equal(first.status,200);assert.ok(t.calls[0].response!.destroyed);
  await call(middleware,'https://public.example/image');assert.equal(t.calls.length,1);
  const link=await call(middleware,'https://public.example/article');assert.equal(link.body.title,'Safe');assert.equal(link.body.image,undefined);
  assert.equal((await call(middleware,'https://public.example/article','POST')).status,405);
});
test('oversized preview documents fail without exposing upstream details',async()=>{
  const t=transport(()=>({body:'x'.repeat(513*1024)}));const middleware=embedPreviews({request:t.request,lookup:publicLookup});
  const result=await call(middleware,'https://public.example/huge');assert.equal(result.status,502);assert.equal(result.body.error,'Preview unavailable.');assert.ok(t.calls[0].response!.destroyed);
});
