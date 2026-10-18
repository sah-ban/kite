import { writeOrigin } from './proxy.mjs';
export const MAX_IMAGE_BYTES=10*1024*1024;
export function imageType(bytes) {
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))return 'image/gif';
  if(bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  return undefined;
}
export function imageUploads(config,dependencies={}) {
  const send=dependencies.fetch||fetch,now=dependencies.now||Date.now,limits=new Map();
  return async(req,res,next)=>{
    if(new URL(req.url||'/','http://localhost').pathname!=='/api/images/upload')return next();
    const reply=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error}));};
    if(req.method!=='POST')return reply(405,'Use POST to upload an image.');
    try{const origin=writeOrigin(req,config);if(origin.host!==req.headers.host||req.headers.origin!==origin.origin)return reply(403,'Origin mismatch. Open Freecast at its configured address.');}catch{return reply(403,'Invalid request origin.');}
    if(!config.IMGBB_API_KEY)return reply(503,'Image uploads are not configured. Set IMGBB_API_KEY in the server .env and restart.');
    const declaredType=String(req.headers['content-type']||'').toLowerCase();
    if(!['image/jpeg','image/png','image/gif','image/webp'].includes(declaredType))return reply(415,'Choose a JPEG, PNG, GIF or WebP image.');
    if(Number(req.headers['content-length'])>MAX_IMAGE_BYTES)return reply(413,'Images must be 10 MB or smaller.');
    const time=now();for(const [ip,limit] of limits)if(limit.reset<=time)limits.delete(ip);
    const ip=req.socket?.remoteAddress||'unknown',limit=limits.get(ip)||{count:0,reset:time+3600_000};
    if(limit.count>=20||(!limits.has(ip)&&limits.size>=10_000))return reply(429,'Too many image uploads. Try again later.');
    limit.count++;limits.set(ip,limit);
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>MAX_IMAGE_BYTES)return reply(413,'Images must be 10 MB or smaller.');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks),type=imageType(bytes);
      if(!type||type!==declaredType)return reply(415,'The file is not a supported image or its type does not match.');
      const form=new FormData();form.append('key',config.IMGBB_API_KEY);form.append('image',new Blob([bytes],{type}),'image.'+({ 'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp' }[type]));
      const response=await send('https://api.imgbb.com/1/upload',{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});
      const result=await response.json();
      if(!response.ok||!result.success)throw new Error('Upload failed');
      const url=new URL(result.data?.url);
      if(url.protocol!=='https:'||url.hostname!=='i.ibb.co'||url.username||url.password||url.port||Buffer.byteLength(url.href)>256)throw new Error('Invalid image URL');
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({url:url.href}));
    }catch{return reply(502,'Image upload failed. Please try again.');}
  };
}
