import { hub, type Config } from './hub';

export function githubHandle(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  const handle=value.trim().replace(/^@/,'');
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(handle)&&!handle.includes('--')?handle:undefined;
}

export type Wallet={protocol:'ethereum'|'solana';address:string};
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function walletAddress(value:unknown,protocol:Wallet['protocol']):string|undefined {
  if(typeof value!=='string')return;
  const address=value.trim();
  if(protocol==='ethereum')return /^0x[\da-f]{40}$/i.test(address)?address.toLowerCase():undefined;
  if(/^0x[\da-f]{64}$/i.test(address)){
    let number=BigInt(address),encoded='';
    while(number){encoded=alphabet[Number(number%58n)]+encoded;number/=58n;}
    const zeroBytes=address.slice(2).match(/^(?:00)*/)?.[0].length||0;
    return '1'.repeat(zeroBytes/2)+encoded;
  }
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))return;
  let number=0n;for(const character of address)number=number*58n+BigInt(alphabet.indexOf(character));
  let bytes=0;while(number){bytes++;number>>=8n;}
  return bytes+(address.match(/^1*/)?.[0].length||0)===32?address:undefined;
}

export function verificationWallet(message:unknown,fid:number):Wallet|undefined {
  const data=(message as {data?:{fid?:number;type?:number|string;verificationAddAddressBody?:{address?:unknown;protocol?:unknown};verificationAddEthAddressBody?:{address?:unknown;protocol?:unknown}}})?.data;
  if(!data||data.fid!==fid||![7,'MESSAGE_TYPE_VERIFICATION_ADD_ETH_ADDRESS','MESSAGE_TYPE_VERIFICATION_ADD_ADDRESS'].includes(data.type!))return;
  const body=data.verificationAddAddressBody||data.verificationAddEthAddressBody;
  if(!body)return;
  const protocol=body.protocol===1||body.protocol==='PROTOCOL_SOLANA'?'solana':body.protocol===undefined||body.protocol===0||body.protocol==='PROTOCOL_ETHEREUM'?'ethereum':undefined;
  if(!protocol)return;
  const address=walletAddress(body.address,protocol);
  return address?{protocol,address}:undefined;
}

export async function readVerifiedWallets(config:Config,fid:number,signal?:AbortSignal):Promise<Wallet[]> {
  const wallets=new Map<string,Wallet>(),seen=new Set<string>();let token='';
  const deadline=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(25_000)]);
  for(let page=0;page<100;page++){
    const result=await hub<{messages:unknown[];nextPageToken?:string}>(config,'verificationsByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})},deadline);
    if(!Array.isArray(result.messages))throw new Error('Invalid wallet response.');
    for(const message of result.messages){const wallet=verificationWallet(message,fid);if(wallet)wallets.set(`${wallet.protocol}:${wallet.address}`,wallet);}
    const next=result.nextPageToken;
    if(next!==undefined&&typeof next!=='string')throw new Error('Invalid wallet cursor.');
    if(!next)return [...wallets.values()];
    if(seen.has(next))throw new Error('Wallet pagination did not advance.');
    seen.add(next);token=next;
  }
  throw new Error('Wallet list is too large to load completely.');
}
