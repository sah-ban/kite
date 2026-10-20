import { HubEvent, MessageData } from '@farcaster/core';
import { decodeAbiParameters } from 'viem';
import {validFid} from './store.mjs';
const metadataAbi=[{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}];
export const hex=value=>typeof value==='string'?(value.startsWith('0x')?value.toLowerCase():'0x'+Buffer.from(value,'base64').toString('hex')):'0x'+Buffer.from(value||[]).toString('hex');
export function dataOf(message){return message?.data||(message?.dataBytes?.length?MessageData.decode(message.dataBytes):undefined);}
export function castOf(message) {
  const data=dataOf(message),body=data?.castAddBody;
  if(!body)return;
  return {hash:hex(message.hash),signer:hex(message.signer),data:{fid:Number(data.fid),timestamp:data.timestamp,castAddBody:{text:body.text,mentions:body.mentions||[],mentionsPositions:body.mentionsPositions||[],type:body.type,
    ...(body.parentCastId?{parentCastId:{fid:Number(body.parentCastId.fid),hash:hex(body.parentCastId.hash)}}:{}),...(body.parentUrl?{parentUrl:body.parentUrl}:{}),
    embedsDeprecated:body.embedsDeprecated||[],embeds:(body.embeds||[]).map(embed=>embed.castId?{castId:{fid:Number(embed.castId.fid),hash:hex(embed.castId.hash)}}:{url:embed.url})}}};
}
export function requesterOf(signer){
  if(signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN')return validFid(signer.requestFid)?Number(signer.requestFid):undefined;
  const metadata=signer.onChainEvent?.signerEventBody?.metadata||signer.signerEventBody?.metadata;
  try{const value=Number(decodeAbiParameters(metadataAbi,hex(metadata))[0].requestFid);return validFid(value)?value:undefined;}catch{return;}
}
function varint(value){let n=BigInt(value);const out=[];while(n>127n){out.push(Number(n&127n)|128);n>>=7n;}out.push(Number(n));return out;}
export function subscriptionRequest(shard,from){
  // Snapchain requires explicit event types; an empty list matches nothing.
  const types=[1,2,3,6,9,10,11,12,13,14,15];
  return Buffer.from([10,types.length,...types,...(from!==undefined?[16,...varint(from)]:[]),32,...varint(shard)]);
}
export const decodeEvent=bytes=>HubEvent.decode(bytes);
