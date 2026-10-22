import type { Cast } from './hub';
import { castTextParts } from './mentions';
import { classifyEmbed, embedPreview, embedURL } from './embeds';
import { xHandle } from './x-handle';
// @ts-expect-error Shared text link detection.
import { textLinks } from '../../link-embeds.mjs';

export async function twitterMediaUrls(cast:Cast):Promise<Set<string>> {
  const body=cast.data.castAddBody;
  const urls=[...new Set([...(body.embeds||[]).flatMap(embed=>embed.url?[embed.url]:[]),...(body.embedsDeprecated||[])].map(embedURL).filter((url):url is string=>url!==undefined&&classifyEmbed(url)?.kind==='link'))];
  const media=await Promise.all(urls.map(async url=>{
    try{const preview=await embedPreview(url);return preview.kind==='image'||preview.kind==='video'?url:undefined;}
    catch{return undefined;}
  }));
  return new Set(media.filter((url):url is string=>Boolean(url)));
}

export function twitterIntent(cast:Cast,usernames:Record<number,string>={},mediaUrls:ReadonlySet<string>=new Set()):string {
  const body=cast.data.castAddBody;
  const text=castTextParts(body.text,body.mentions,body.mentionsPositions).parts.map(part=>{
    if(part.fid===undefined)return part.text;
    const handle=xHandle(usernames[part.fid]);return handle?`@${handle}`:`https://farcaster.xyz/${part.fid}`;
  }).join('');
  const seen=new Set<string>(textLinks(text)),urls:string[]=[];
  for(const embed of [...(body.embeds||[]),...(body.embedsDeprecated||[]).map(url=>({url}))]){
    const raw='castId' in embed&&embed.castId?`https://farcaster.xyz/${embed.castId.fid}/${embed.castId.hash}`:embed.url;
    const url=raw?embedURL(raw):undefined;
    if(url&&classifyEmbed(url)?.kind==='link'&&!mediaUrls.has(url)&&!seen.has(url)){seen.add(url);urls.push(url);}
  }
  return `https://twitter.com/intent/tweet?${new URLSearchParams({text:[text,...urls].filter(Boolean).join('\n\n')})}`;
}
