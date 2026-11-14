import {safeLink} from './model';
import {imageExtension} from './download-image-core';

export async function downloadImage(url:string):Promise<string>{
  const source=safeLink(url);if(!source)throw new Error('Invalid image URL.');
  const response=await fetch(source,{credentials:'omit',signal:AbortSignal.timeout(65000)});
  if(!response.ok)throw new Error('Could not download this image.');
  const blob=await response.blob(),extension=imageExtension(new Uint8Array(await blob.slice(0,64).arrayBuffer()));
  const objectURL=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectURL;link.download=`kite-${Date.now()}.${extension}`;document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);}
  return 'Download started';
}
