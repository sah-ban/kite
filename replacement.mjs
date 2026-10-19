import { hexToBytes } from 'viem';
import { loadModernSdk } from './modern-sdk.mjs';
const bytes=value=>new TextEncoder().encode(value).length;
const castId=value=>{
  if(!value||!Number.isSafeInteger(value.fid)||value.fid<=0||typeof value.hash!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(value.hash))throw new Error('Invalid cast reference.');
  return {fid:value.fid,hash:value.hash};
};
const url=value=>{
  if(typeof value!=='string'||!bytes(value)||bytes(value)>256)throw new Error('Embed and context URLs must be between 1 and 256 UTF-8 bytes.');return value;
};
export function replacementBody(input) {
  if(!input||typeof input.text!=='string'||bytes(input.text)>10000)throw new Error('Write up to 10,000 UTF-8 bytes.');
  const mentions=input.mentions??[],mentionsPositions=input.mentionsPositions??[];
  const boundaries=new Set([0]);let offset=0;for(const character of input.text){offset+=bytes(character);boundaries.add(offset);}
  if(!Array.isArray(mentions)||!Array.isArray(mentionsPositions)||mentions.length>10||mentions.length!==mentionsPositions.length||mentions.some(fid=>!Number.isSafeInteger(fid)||fid<=0)||mentionsPositions.some((position,index)=>!Number.isSafeInteger(position)||!boundaries.has(position)||(index>0&&position<mentionsPositions[index-1])))throw new Error('Invalid mentions.');
  if(!Array.isArray(input.embeds)||input.embeds.length>4)throw new Error('Attach up to four embeds.');
  const embeds=input.embeds.map(embed=>{
    if(!embed||(embed.url!==undefined)===(embed.castId!==undefined))throw new Error('Invalid embed.');
    return embed.castId?{castId:castId(embed.castId)}:{url:url(embed.url)};
  });
  if(!input.text.trim()&&!mentions.length&&!embeds.length)throw new Error('Write some text or include a mention or embed.');
  if(input.parentCastId&&input.parentUrl!==undefined)throw new Error('Use one reply or channel context.');
  const length=bytes(input.text);
  return {text:input.text,mentions,mentionsPositions,embeds,type:length<=320?0:length<=1024?1:2,...(input.parentCastId?{parentCastId:castId(input.parentCastId)}:{}),...(input.parentUrl!==undefined?{parentUrl:url(input.parentUrl)}:{})};
}
export async function buildReplacementMessage(input,source,fid,signer) {
  if(source?.fid!==fid)throw new Error('You can only edit your own casts.');castId(source);
  const sdk=await loadModernSdk(),now=sdk.getFarcasterTime()._unsafeUnwrap();
  if(!Number.isSafeInteger(source.timestamp)||source.timestamp<0||source.timestamp>now+300)throw new Error('Invalid original cast timestamp.');
  return buildCastMessage(input,fid,signer,Math.max(now,source.timestamp+1));
}
export async function buildCastMessage(input,fid,signer,timestamp) {
  const sdk=await loadModernSdk(),body=replacementBody(input);
  const convert=value=>({...value,hash:hexToBytes(value.hash)});
  const result=await sdk.makeCastAdd({...body,embeds:body.embeds.map(embed=>embed.castId?{castId:convert(embed.castId)}:embed),embedsDeprecated:[],...(body.parentCastId?{parentCastId:convert(body.parentCastId)}:{})},{fid,network:sdk.FarcasterNetwork.MAINNET,...(timestamp!==undefined?{timestamp}:{})},signer);
  if(result.isErr())throw new Error(result.error.message);
  return result.value;
}
