import type {Api} from './api';

export type ClientLogo='warpcast'|'firefly'|'kite'|'neynar';
export type CastClient={fid:number;name?:string;username?:string;avatar?:string;logo?:ClientLogo};
const knownClients:Readonly<Record<number,CastClient>>={
  6131:{fid:6131,name:'Neynar',username:'neynar',logo:'neynar'},
  9152:{fid:9152,name:'Warpcast',username:'warpcast',logo:'warpcast'},
  16823:{fid:16823,name:'Firefly App',username:'fireflyapp',logo:'firefly'},
  925685:{fid:925685,name:'Kite',username:'kiteapp',logo:'kite'},
};
export function knownCastClient(fid:number):CastClient|undefined{return knownClients[fid];}

export async function resolveCastClient(api:Pick<Api,'signerRequester'|'profile'>,authorFid:number,signer:string):Promise<CastClient|undefined>{
  const fid=await api.signerRequester(authorFid,signer);if(!fid)return;
  const known=knownCastClient(fid);if(known)return known;
  // When requester === author, profile() reuses the same cached request as the author row.
  const profile=await api.profile(fid).catch(()=>undefined);
  return {fid,name:profile?.name,username:profile?.username,avatar:profile?.avatar};
}
