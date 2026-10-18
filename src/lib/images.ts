export const MAX_IMAGE_BYTES=10*1024*1024;
export const IMAGE_TYPES=['image/jpeg','image/png','image/gif','image/webp'];
export function imageEmbeds(images:string[],quoted=false):{url:string}[] {
  if(!Array.isArray(images)||images.length>(quoted?1:2))throw new Error(`Attach up to ${quoted?1:2} images${quoted?' with a quote':''}.`);
  return images.map(value=>{
    let url:URL;try{url=new URL(value);}catch{throw new Error('Invalid image attachment URL.');}
    if(url.protocol!=='https:'||!(url.hostname==='i.ibb.co'||(/^media(?:\d+)?\.tenor\.com$/.test(url.hostname)&&url.pathname.endsWith('.gif')))||url.username||url.password||url.port||new TextEncoder().encode(url.href).length>256)throw new Error('Invalid image attachment URL.');
    return {url:url.href};
  });
}
export async function uploadImage(file:File,signal?:AbortSignal):Promise<string> {
  if(!IMAGE_TYPES.includes(file.type))throw new Error('Choose a JPEG, PNG, GIF or WebP image.');
  if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('Images must be between 1 byte and 10 MB.');
  const response=await fetch('/api/images/upload',{method:'POST',headers:{'Content-Type':file.type},body:file,signal:signal||AbortSignal.timeout(65_000)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Image upload failed. Please try again.');
  return imageEmbeds([result.url])[0].url;
}
