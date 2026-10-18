import type { ActivityTab } from './social';
export type ClientRoute = {kind:'home'} | {kind:'following'} | {kind:'profile';fid:number} | {kind:'cast';fid:number;hash:string;tab:ActivityTab};
export function clientRoute(pathname:string,search=''):ClientRoute {
  const profile=pathname.match(/^\/profile\/(\d+)\/?$/),cast=pathname.match(/^\/cast\/(\d+)\/(0x[0-9a-fA-F]{40})\/?$/);
  const fid=Number(profile?.[1]||cast?.[1]);
  if(Number.isSafeInteger(fid)&&fid>0){
    if(profile)return {kind:'profile',fid};
    if(cast){const tab=new URLSearchParams(search).get('tab');return {kind:'cast',fid,hash:cast[2],tab:tab==='likes'||tab==='recasts'?tab:'replies'};}
  }
  return {kind:pathname==='/following'?'following':'home'};
}
