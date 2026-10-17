import { bytesToHex, decodeAbiParameters, type Hex } from 'viem';
import { hub, type Config, type Cast } from './hub';
export const metadataAbi = [{type:'tuple',components:[{name:'requestFid',type:'uint256'},{name:'requestSigner',type:'address'},{name:'signature',type:'bytes'},{name:'deadline',type:'uint256'}]}] as const;
export function requester(metadata: string): number | undefined {
  try {
    const hex: Hex = metadata.startsWith('0x') ? metadata as Hex : bytesToHex(Uint8Array.from(atob(metadata),c=>c.charCodeAt(0)));
    return Number(decodeAbiParameters(metadataAbi,hex)[0].requestFid);
  } catch { return undefined; }
}
const cache = new Map<number,Promise<Map<string,number>>>();
async function keys(config: Config, fid: number) {
  if (!cache.has(fid)) cache.set(fid,(async()=>{
    const map = new Map<string,number>(); let token = '';
    do {
      const page = await hub<{events:{signerEventBody?:{key:string;metadata:string}}[];nextPageToken?:string}>(config,'onChainSignersByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})});
      for(const event of page.events) { const body = event.signerEventBody; if(body) {const requestFid=requester(body.metadata);if(requestFid)map.set(body.key.toLowerCase(),requestFid);} }
      token = page.nextPageToken || '';
    } while(token);
    return map;
  })().catch(e=>{cache.delete(fid);throw e;}));
  return cache.get(fid)!;
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
