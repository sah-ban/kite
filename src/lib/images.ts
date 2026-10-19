export const MAX_IMAGE_BYTES=10*1024*1024;
export const IMAGE_TYPES=['image/jpeg','image/png','image/gif','image/webp'];
// @ts-expect-error Shared attachment validation for browser and signing server.
import { imageEmbeds as validateImageEmbeds } from '../../cast.mjs';
export function imageEmbeds(images:string[],quoted=false,maximum=2):{url:string}[]{return validateImageEmbeds(images,quoted,maximum);}
export async function uploadImage(file:File,signal?:AbortSignal):Promise<string> {
  if(!IMAGE_TYPES.includes(file.type))throw new Error('Choose a JPEG, PNG, GIF or WebP image.');
  if(!file.size||file.size>MAX_IMAGE_BYTES)throw new Error('Images must be between 1 byte and 10 MB.');
  const response=await fetch('/api/images/upload',{method:'POST',headers:{'Content-Type':file.type},body:file,signal:signal||AbortSignal.timeout(65_000)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Image upload failed. Please try again.');
  return imageEmbeds([result.url])[0].url;
}
