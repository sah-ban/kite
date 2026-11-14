import {safeLink} from './model';

export class ImageSavePermissionError extends Error {
  constructor(message='Allow Kite to save images in your device settings, then try again.'){super(message);}
}
export class ImageSaveCancelledError extends Error {}
export function imageExtension(bytes:Uint8Array):string{
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value))return 'png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  const text=String.fromCharCode(...bytes.slice(0,64));
  if(text.startsWith('GIF87a')||text.startsWith('GIF89a'))return 'gif';
  if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'webp';
  if(text.startsWith('BM'))return 'bmp';
  if(text.startsWith('II*\0')||text.startsWith('MM\0*'))return 'tiff';
  if(text.slice(4,8)==='ftyp'){
    const brands=text.slice(8);if(/avif|avis/.test(brands))return 'avif';
    if(/heic|heix|hevc|hevx/.test(brands))return 'heic';
    if(/mif1|msf1/.test(brands))return 'heif';
  }
  throw new Error('This file is not a supported image.');
}
export type ImageDownloadIO={requestPermission:()=>Promise<boolean>;download:(url:string)=>Promise<void>;header:()=>Promise<Uint8Array>;save:(extension:string)=>Promise<void>;cleanup:()=>Promise<void>};
export async function saveDownloadedImage(url:string,io:ImageDownloadIO){
  const source=safeLink(url);if(!source)throw new Error('Invalid image URL.');
  if(!await io.requestPermission())throw new ImageSavePermissionError();
  try{await io.download(source);await io.save(imageExtension(await io.header()));}
  finally{await io.cleanup().catch(()=>{});}
}
