export type EmbedInfo = {kind:'image'|'video'|'link';url:string;title?:string;description?:string;site?:string;image?:string;poster?:string;contentType?:string;sourceUrl?:string};
export type ClassifiedEmbed = {kind:'image'|'video'|'youtube'|'vimeo'|'link';url:string;id?:string};
export function embedURL(value:string):string|undefined {
  try {
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
    return url.href;
  }catch{return;}
}
export function classifyEmbed(value:string):ClassifiedEmbed|undefined {
  const normalized=embedURL(value);if(!normalized)return;
  const url=new URL(normalized),host=url.hostname.toLowerCase(),path=url.pathname.toLowerCase();
  const youtube=host==='youtu.be'?url.pathname.slice(1).split('/')[0]:['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)?url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]:undefined;
  if(youtube&&/^[a-zA-Z0-9_-]{11}$/.test(youtube))return {kind:'youtube',url:normalized,id:youtube};
  const vimeo=['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)?url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1]:undefined;
  if(vimeo)return {kind:'vimeo',url:normalized,id:vimeo};
  if(/\.(?:png|jpe?g|gif|webp|avif|apng|bmp|svg)$/.test(path)||host==='imagedelivery.net'||path.includes('/cdn-cgi/imagedelivery/'))return {kind:'image',url:normalized};
  if(/\.(?:mp4|webm|mov|m4v|ogv|m3u8)$/.test(path))return {kind:'video',url:normalized};
  return {kind:'link',url:normalized};
}
const cache=new Map<string,{expires:number;value:Promise<EmbedInfo>}>();
let active=0;const waiting:(()=>void)[]=[];
export function embedPreview(url:string):Promise<EmbedInfo> {
  const saved=cache.get(url);if(saved&&saved.expires>Date.now())return saved.value;
  const value=(async()=>{
    if(active>=4)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
    try {
      const response=await fetch(`/api/embed?${new URLSearchParams({url})}`,{signal:AbortSignal.timeout(16_000)});
      if(!response.ok)throw new Error('Preview unavailable.');
      const info:EmbedInfo=await response.json();
      if(!['image','video','link'].includes(info.kind)||!embedURL(info.url))throw new Error('Invalid preview.');
      return info;
    }finally{const next=waiting.shift();if(next)next();else active--;}
  })().catch(error=>{cache.delete(url);throw error;});
  cache.set(url,{expires:Date.now()+5*60_000,value});if(cache.size>200)cache.delete(cache.keys().next().value!);
  return value;
}
