import type { Cast } from './hub';
import { castTextParts } from './mentions';
import { embedURL } from './embeds';
import { xHandle } from './x-handle';
// @ts-expect-error Shared text link detection.
import { textLinks } from '../../link-embeds.mjs';

export function twitterIntent(cast:Cast,usernames:Record<number,string>={}):string {
  const body=cast.data.castAddBody;
  const text=castTextParts(body.text,body.mentions,body.mentionsPositions).parts.map(part=>{
    if(part.fid===undefined)return part.text;
    const handle=xHandle(usernames[part.fid]);return handle?`@${handle}`:`https://farcaster.xyz/${part.fid}`;
  }).join('');
  const seen=new Set<string>(textLinks(text)),urls:string[]=[];
  for(const embed of [...(body.embeds||[]),...(body.embedsDeprecated||[]).map(url=>({url}))]){
    const raw='castId' in embed&&embed.castId?`https://farcaster.xyz/${embed.castId.fid}/${embed.castId.hash}`:embed.url;
    const url=raw?embedURL(raw):undefined;
    if(url&&!seen.has(url)){seen.add(url);urls.push(url);}
  }
  return `https://twitter.com/intent/tweet?${new URLSearchParams({text:[text,...urls].filter(Boolean).join('\n\n')})}`;
}
