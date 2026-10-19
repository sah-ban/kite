import { hub, type Config } from './hub';
import { requester, validFid } from './attribution';

export type ConnectedClient={fid:number;keyCount:number};
export type ConnectedClientsData={clients:ConnectedClient[];unknownKeys:number};
export function connectedClients(signers:unknown[],fid:number,now=Date.now()/1000):ConnectedClientsData {
  const keys=new Map<string,{requestFid?:number}>();
  for(const value of signers){
    const signer=value as {fid?:unknown;key?:unknown;keyType?:unknown;source?:unknown;requestFid?:unknown;expiresAt?:unknown;onChainEvent?:{signerEventBody?:{metadata?:string;eventType?:unknown}}}|null;
    if(!signer||validFid(signer.fid)!==fid||signer.keyType!==1||typeof signer.key!=='string'||!/^0x[\da-f]{64}$/i.test(signer.key))continue;
    const key=signer.key.toLowerCase();
    keys.delete(key);
    if(signer.expiresAt!==undefined){
      const expiry=typeof signer.expiresAt==='number'||typeof signer.expiresAt==='string'&&/^\d+$/.test(signer.expiresAt)?Number(signer.expiresAt):NaN;
      if(!Number.isSafeInteger(expiry)||expiry<0||expiry>0&&expiry<=now)continue;
    }
    const onchain=signer.source===1||signer.source==='SIGNER_SOURCE_ONCHAIN',offchain=signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN';
    const event=signer.onChainEvent?.signerEventBody;
    if(onchain&&event?.eventType!==undefined&&event.eventType!==1&&event.eventType!=='SIGNER_EVENT_TYPE_ADD')continue;
    keys.set(key,{requestFid:offchain?validFid(signer.requestFid):onchain?requester(event?.metadata||''):undefined});
  }
  const groups=new Map<number,ConnectedClient>();let unknownKeys=0;
  for(const key of keys.values()){
    if(!key.requestFid){unknownKeys++;continue;}
    const client=groups.get(key.requestFid);if(client)client.keyCount++;else groups.set(key.requestFid,{fid:key.requestFid,keyCount:1});
  }
  return {clients:[...groups.values()].sort((a,b)=>a.fid-b.fid),unknownKeys};
}
export async function readConnectedClients(config:Config,fid:number,signal?:AbortSignal):Promise<ConnectedClientsData> {
  if(validFid(fid)!==fid)throw new Error('Invalid profile FID.');
  const deadline=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20_000)]),seen=new Set<string>(),signers:unknown[]=[];let token='';
  for(let page=0;page<200;page++){
    const data=await hub<{signers:unknown[];nextPageToken?:string}>(config,'signersByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})},deadline);
    if(!Array.isArray(data.signers))throw new Error('Invalid connected client response.');
    signers.push(...data.signers);
    const next=data.nextPageToken;
    if(next!==undefined&&typeof next!=='string')throw new Error('Invalid connected client cursor.');
    if(!next)return connectedClients(signers,fid);
    if(seen.has(next))throw new Error('Connected client pagination did not advance.');seen.add(next);token=next;
  }
  throw new Error('Connected client list is too large to load completely.');
}
