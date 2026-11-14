import {safeLink} from './model';

type Embed={kind:'image'|'video'|'link';url:string};
export function galleryEmbeds(raw:unknown):string[]{
  if(typeof raw!=='string'||raw.length>20000)return [];
  try{const value:unknown=JSON.parse(raw);return Array.isArray(value)?value.slice(0,4).flatMap(url=>typeof url==='string'&&safeLink(url)?[safeLink(url)!]:[]):[];}catch{return [];}
}
export async function resolveGallery(embeds:string[],source:string|undefined,selected:string,read:(url:string)=>Promise<Embed>){
  const results=await Promise.all(embeds.map(async url=>{
    if(url===source)return selected;
    try{const embed=await read(url);return embed.kind==='image'?safeLink(embed.url):undefined;}catch{return;}
  }));
  const images=[...new Set(results.filter((url):url is string=>!!url))];
  if(!images.includes(selected))images.push(selected);
  return images;
}
