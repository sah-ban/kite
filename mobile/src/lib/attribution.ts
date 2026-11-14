import {bytesToHex,decodeAbiParameters,type Hex} from 'viem';
import {isFid} from './model';

export const metadataAbi=[{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}] as const;
const fidValue=(value:unknown)=>typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?isFid(Number(value))?Number(value):undefined:undefined;
const validKey=(key:unknown):key is string=>typeof key==='string'&&/^0x[\da-f]{64}$/i.test(key);
function requester(metadata:unknown){
  if(typeof metadata!=='string')return;
  try{const hex=metadata.startsWith('0x')?metadata as Hex:bytesToHex(Uint8Array.from(atob(metadata),char=>char.charCodeAt(0)));return fidValue(decodeAbiParameters(metadataAbi,hex)[0].requestFid.toString());}catch{return;}
}
type SignerEvent={signerEventBody?:{key?:string;metadata?:string}};
type Signer={fid?:number|string;key?:string;keyType?:number;source?:string|number;requestFid?:number|string;onChainEvent?:SignerEvent};
type Read=<T>(endpoint:string,params:Record<string,string|number>)=>Promise<T>;

export function createAttribution(read:Read,now=Date.now){
  const cache=new Map<number,{expires:number;value:Promise<Map<string,number>>}>();
  async function pages(endpoint:'onChainSignersByFid'|'signersByFid',fid:number){
    const result=new Map<string,number>(),seen=new Set<string>();let token='';
    for(let index=0;index<100;index++){
      const page=await read<{events?:SignerEvent[];signers?:Signer[];nextPageToken?:string}>(endpoint,{fid,pageSize:100,...(token?{pageToken:token}:{})});
      if(endpoint==='onChainSignersByFid'){
        if(!Array.isArray(page.events))throw new Error('Client attribution unavailable.');
        for(const event of page.events){const body=event?.signerEventBody,requestFid=requester(body?.metadata);if(validKey(body?.key)&&requestFid)result.set(body.key.toLowerCase(),requestFid);}
      }else{
        if(!Array.isArray(page.signers))throw new Error('Client attribution unavailable.');
        for(const signer of page.signers){
          if(!signer||fidValue(signer.fid)!==fid||signer.keyType!==1||!validKey(signer.key))continue;
          const requestFid=signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN'?fidValue(signer.requestFid):signer.source===1||signer.source==='SIGNER_SOURCE_ONCHAIN'?requester(signer.onChainEvent?.signerEventBody?.metadata):undefined;
          if(requestFid)result.set(signer.key.toLowerCase(),requestFid);
        }
      }
      const next=page.nextPageToken;if(!next)return result;
      if(typeof next!=='string'||seen.has(next))throw new Error('Client attribution unavailable.');
      seen.add(next);token=next;
    }
    throw new Error('Client attribution unavailable.');
  }
  return async(fid:number,key:string):Promise<number|undefined>=>{
    if(!isFid(fid)||!validKey(key))return;
    let entry=cache.get(fid);
    if(!entry||entry.expires<=now()){
      const fresh={expires:Infinity,value:Promise.resolve(new Map<string,number>())};
      fresh.value=Promise.allSettled([pages('onChainSignersByFid',fid),pages('signersByFid',fid)]).then(results=>{
        const successful=results.filter((item):item is PromiseFulfilledResult<Map<string,number>>=>item.status==='fulfilled');
        if(!successful.length)throw new Error('Client attribution unavailable.');
        const map=new Map(successful.flatMap(item=>[...item.value]));fresh.expires=now()+(successful.length===2&&map.size?30000:5000);return map;
      }).catch(error=>{if(cache.get(fid)===fresh)cache.delete(fid);throw error;});
      cache.set(fid,fresh);if(cache.size>100)cache.delete(cache.keys().next().value!);entry=fresh;
    }
    return (await entry.value).get(key.toLowerCase());
  };
}
