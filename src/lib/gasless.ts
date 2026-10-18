import { Message as LegacyMessage, type Message } from '@farcaster/core';
import { bytesToHex, type Hex } from 'viem';
import type { mnemonicToAccount } from 'viem/accounts';
import { hub, type Config } from './hub';
import { loadGaslessSdk } from './gasless-sdk';

export const GASLESS_SCOPES=[1,2,3,4,5,6];
export const GASLESS_TTL=30*24*60*60;
const scopeNames:Record<number,string>={1:'MESSAGE_TYPE_CAST_ADD',2:'MESSAGE_TYPE_CAST_REMOVE',3:'MESSAGE_TYPE_REACTION_ADD',4:'MESSAGE_TYPE_REACTION_REMOVE',5:'MESSAGE_TYPE_LINK_ADD',6:'MESSAGE_TYPE_LINK_REMOVE'};
type NodeSigner={source:string|number;key:string;keyType:number;fid:number;scopes?:(number|string)[];expiresAt?:number|string};
type SignerPage={signers:NodeSigner[];nextPageToken?:string;currentUserNonce:number;gaslessSignerCount:number;gaslessSignerLimit:number};

export async function gaslessState(config:Config,fid:number,token=''):Promise<SignerPage> {
  const page=await hub<SignerPage>(config,'signersByFid',{fid,pageSize:100,...(token?{pageToken:token}:{})});
  if(!Array.isArray(page.signers)||!Number.isSafeInteger(page.currentUserNonce)||page.currentUserNonce<0||page.currentUserNonce>0xffffffff)throw new Error('This node does not provide a valid gasless signer nonce. Use a node supporting gasless keys.');
  return page;
}

export async function checkGaslessSigner(config:Config,fid:number,key:Hex):Promise<boolean> {
  let token='';
  do{
    const page=await gaslessState(config,fid,token);
    const signer=page.signers.find(s=>s.key.toLowerCase()===key.toLowerCase()&&Number(s.fid)===fid);
    if(signer)return (signer.source===2||signer.source==='SIGNER_SOURCE_OFFCHAIN')&&signer.keyType===1&&Number(signer.expiresAt)>Date.now()/1000&&GASLESS_SCOPES.every(scope=>signer.scopes?.includes(scope)||signer.scopes?.includes(scopeNames[scope]));
    token=page.nextPageToken||'';
  }while(token);
  return false;
}

export async function buildGaslessKey(account:ReturnType<typeof mnemonicToAccount>,fid:number,privateKey:Uint8Array,nonce:number):Promise<{message:Message;key:Hex;deadline:number}> {
  // This SDK is isolated from the existing approval and onchain signer paths.
  const sdk=await loadGaslessSdk();
  const signer=new sdk.NobleEd25519Signer(privateKey);
  const key=(await signer.getSignerKey())._unsafeUnwrap();
  const deadline=sdk.getFarcasterTime()._unsafeUnwrap()+3600;
  const body=(await sdk.makeKeyAddBody({fid:BigInt(fid),key,scopes:GASLESS_SCOPES,ttl:GASLESS_TTL,nonce,deadline},new sdk.ViemLocalEip712Signer(account)))._unsafeUnwrap();
  const message=(await sdk.makeKeyAdd(body,{fid,network:sdk.FarcasterNetwork.MAINNET},signer))._unsafeUnwrap();
  // Keep the new body in signed dataBytes; the old SDK must not re-encode it.
  const envelope=LegacyMessage.decode(sdk.Message.encode({...message,data:undefined}).finish());
  return {message:envelope,key:bytesToHex(key),deadline};
}
