import { hexToBytes } from 'viem';
import { loadModernSdk } from './modern-sdk.mjs';
import {castReference as castId,replacementBody} from './cast-body.mjs';
export {replacementBody} from './cast-body.mjs';
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
