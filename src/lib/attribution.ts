import { bytesToHex, decodeAbiParameters, type Hex } from 'viem';
import { hub, type Config, type Cast } from './hub';
export const metadataAbi = [{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}] as const;
export const validFid=(value:unknown):number|undefined=>{
  if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return;
  const fid=Number(value);return Number.isSafeInteger(fid)&&fid>0?fid:undefined;
};
export function requester(metadata: string): number | undefined {
  try {
    const hex: Hex = metadata.startsWith('0x') ? metadata as Hex : bytesToHex(Uint8Array.from(atob(metadata),c=>c.charCodeAt(0)));
    return validFid(decodeAbiParameters(metadataAbi,hex)[0].requestFid.toString());
  } catch { return undefined; }
}
type SignerEvent={signerEventBody?:{key:string;metadata:string}};
type UnifiedSigner={fid:number|string;key:string;keyType:number;source:string|number;requestFid?:number|string;onChainEvent?:SignerEvent};
const cache = new Map<string,{expires:number;value:Promise<Map<string,number>>}>();
async function keys(config: Config, fid: number) {
  const cacheKey=`${config.useGateway?'gateway:':''}${config.readUrl}:${fid}`;
  const cached=cache.get(cacheKey);if(cached&&cached.expires>Date.now())return cached.value;
  const entry={expires:Date.now()+30_000,value:Promise.resolve(new Map<string,number>())};
  entry.value=(async()=>{
    const results=await Promise.allSettled([
      (async()=>{
        const map=new Map<string,number>();let token='';
        do{
          const page=await hub<{events:SignerEvent[];nextPageToken?:string}>(config,'onChainSignersByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})});
          if(!Array.isArray(page.events))throw new Error('Invalid onchain signer response.');
          for(const event of page.events){const body=event.signerEventBody;if(body&&/^0x[\da-f]{64}$/i.test(body.key)){const requestFid=requester(body.metadata);if(requestFid)map.set(body.key.toLowerCase(),requestFid);}}
          token=page.nextPageToken||'';
        }while(token);
        return map;
      })(),
      (async()=>{
        const map=new Map<string,number>();let token='';
        do{
          const page=await hub<{signers:UnifiedSigner[];nextPageToken?:string}>(config,'signersByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})});
          if(!Array.isArray(page.signers))throw new Error('Invalid unified signer response.');
          for(const signer of page.signers){
            if(validFid(signer.fid)!==fid||signer.keyType!==1||!/^0x[\da-f]{64}$/i.test(signer.key))continue;
            const requestFid=signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN'?validFid(signer.requestFid):signer.source===1||signer.source==='SIGNER_SOURCE_ONCHAIN'?requester(signer.onChainEvent?.signerEventBody?.metadata||''):undefined;
            if(requestFid)map.set(signer.key.toLowerCase(),requestFid);
          }
          token=page.nextPageToken||'';
        }while(token);
        return map;
      })(),
    ]);
    const successful=results.filter((r):r is PromiseFulfilledResult<Map<string,number>>=>r.status==='fulfilled');
    if(!successful.length)throw new Error('Could not read signer attribution from this node.');
    const map=new Map(successful.flatMap(r=>[...r.value]));
    if(successful.length<results.length||!map.size)entry.expires=Date.now()+5_000;
    return map;
  })().catch(error=>{if(cache.get(cacheKey)===entry)cache.delete(cacheKey);throw error;});
  cache.set(cacheKey,entry);
  if(cache.size>500)cache.delete(cache.keys().next().value!);
  return entry.value;
}
export async function attribute(config: Config, casts: Cast[]): Promise<Map<string,number>> {
  const map = new Map<string,number>();
  const authors = [...new Set(casts.map(c=>c.data.fid))];
  const failures: number[] = [];
  for(let i=0;i<authors.length;i+=4) await Promise.all(authors.slice(i,i+4).map(async fid=>{
    try {for(const [key,requestFid] of await keys(config,fid))map.set(key,requestFid);} catch {failures.push(fid);}
  }));
  if(failures.length) throw new Error(`Client attribution failed for ${failures.length} author(s). Retry the filter when the node is available.`);
  return map;
}
export async function signerRequester(config: Config, fid: number, signer: string): Promise<number | undefined> {
  return (await keys(config, fid)).get(signer.toLowerCase());
}
