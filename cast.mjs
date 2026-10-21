import { linkEmbeds } from './link-embeds.mjs';
import { replacementBody } from './replacement.mjs';
export function imageEmbeds(images,quoted=false,maximum=2) {
  if(!Array.isArray(images)||images.length>(maximum-(quoted?1:0)))throw new Error(`Attach up to ${maximum-(quoted?1:0)} images${quoted?' with a quote':''}.`);
  return images.map(value=>{
    let url;try{url=new URL(value);}catch{throw new Error('Invalid image attachment URL.');}
    if(url.protocol!=='https:'||!(url.hostname==='i.ibb.co'||(/^media(?:\d+)?\.tenor\.com$/.test(url.hostname)&&url.pathname.endsWith('.gif')))||url.username||url.password||url.port||new TextEncoder().encode(url.href).length>256)throw new Error('Invalid image attachment URL.');
    return {url:url.href};
  });
}

export function newCastBody(action) {
  const images=action.images??[];
  const embeds=[...imageEmbeds(images,Boolean(action.quote),4),...linkEmbeds(action.links??[],4-(action.quote?1:0)-images.length)];
  if(action.quote)embeds.push({castId:action.quote});
  return replacementBody({text:action.text,mentions:action.mentions??[],mentionsPositions:action.mentionsPositions??[],embeds,...(action.parent?{parentCastId:action.parent}:{})});
}
export const requiresCastPro=body=>body.type===2;
