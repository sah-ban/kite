import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared Node middleware.
import { imageUploads, MAX_IMAGE_BYTES } from '../uploads.mjs';
import { imageEmbeds, uploadImage } from '../src/lib/images';
const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
const key='test-server-only-key',image='https://i.ibb.co/fixture/image.png';
async function call(middleware:ReturnType<typeof imageUploads>,options:{body?:Buffer;type?:string;origin?:string;size?:number}={}){
  let statusCode=200,body='';const headers:Record<string,string>={};
  const req={url:'/api/images/upload',method:'POST',headers:{host:'localhost:5173',origin:options.origin??'http://localhost:5173','content-type':options.type||'image/png',...(options.size?{'content-length':String(options.size)}:{})},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield options.body||png;}};
  const res={get statusCode(){return statusCode;},set statusCode(value){statusCode=value;},setHeader(k:string,v:string){headers[k]=v;},end(value:string){body=value;}};
  await middleware(req,res,()=>{throw new Error('Unexpected next');});return {status:statusCode,body:JSON.parse(body),raw:body,headers};
}
test('image uploads keep the key server-side and return a direct permanent image URL',async()=>{
  let calls=0;
  const middleware=imageUploads({IMGBB_API_KEY:key},{fetch:async(url:string,init:RequestInit)=>{
    calls++;assert.equal(url,'https://api.imgbb.com/1/upload');assert.equal(init.method,'POST');
    const form=init.body as FormData;assert.equal(form.get('key'),key);assert.equal(form.get('expiration'),null);
    const file=form.get('image') as File;assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),png);
    return Response.json({success:true,data:{url:image,delete_url:'private-delete-link'}});
  }});
  const result=await call(middleware);assert.equal(result.status,200);assert.deepEqual(result.body,{url:image});assert.equal(calls,1);assert.ok(!result.raw.includes(key));assert.ok(!result.raw.includes('delete_url'));
});
test('upload rejects cross-origin, missing origin, oversize and disguised image files before contacting ImgBB',async()=>{
  let calls=0;const middleware=imageUploads({IMGBB_API_KEY:key},{fetch:async()=>{calls++;throw new Error('Must not upload');}});
  assert.equal((await call(middleware,{origin:'https://evil.example'})).status,403);
  assert.equal((await call(middleware,{origin:''})).status,403);
  assert.equal((await call(middleware,{size:MAX_IMAGE_BYTES+1})).status,413);
  assert.equal((await call(middleware,{body:Buffer.alloc(MAX_IMAGE_BYTES+1)})).status,413);
  assert.equal((await call(middleware,{body:Buffer.from('<svg>not an image</svg>')})).status,415);
  assert.equal((await call(middleware,{type:'video/mp4'})).status,415);
  assert.equal(calls,0);
});
test('upload failures do not leak provider responses and limits reset after an hour',async()=>{
  let time=0,calls=0;const middleware=imageUploads({IMGBB_API_KEY:key},{now:()=>time,fetch:async()=>{calls++;return Response.json({success:false,error:{message:key}},{status:400});}});
  for(let i=0;i<20;i++){const result=await call(middleware);assert.equal(result.status,502);assert.ok(!result.raw.includes(key));}
  assert.equal((await call(middleware)).status,429);assert.equal(calls,20);time=3600_001;assert.equal((await call(middleware)).status,502);
  assert.equal((await call(imageUploads({}))).status,503);
});
test('image embeds respect two slots, share one slot with a quote, and reject unsafe URLs',()=>{
  assert.deepEqual(imageEmbeds([image]),[{url:image}]);assert.equal(imageEmbeds([image,image]).length,2);
  assert.throws(()=>imageEmbeds([image,image],true),/up to 1/);assert.throws(()=>imageEmbeds([image,image,image]),/up to 2/);
  for(const url of ['javascript:alert(1)','http://i.ibb.co/a','https://evil.example/a','https://i.ibb.co.evil.example/a','https://user@i.ibb.co/a'])assert.throws(()=>imageEmbeds([url]),/Invalid/);
});
test('browser upload validates file size/type and surfaces server upload errors',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(input,'/api/images/upload');assert.equal((init!.headers as Record<string,string>)['Content-Type'],'image/png');return Response.json({error:'Uploads unavailable'},{status:503});};
  try{
    await assert.rejects(uploadImage(new File(['x'],'bad.svg',{type:'image/svg+xml'})),/Choose/);
    await assert.rejects(uploadImage(new File([],'empty.png',{type:'image/png'})),/between/);assert.equal(calls,0);
    await assert.rejects(uploadImage(new File([png],'image.png',{type:'image/png'})),/Uploads unavailable/);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
