import type { ActivityTab } from './social';
export type ClientRoute = {kind:'home'} | {kind:'following'} | {kind:'notifications'} | {kind:'settings'} | {kind:'search'} | {kind:'profile';fid:number} | {kind:'connections';fid:number;tab:'followers'|'following'} | {kind:'cast';fid:number;hash:string;tab:ActivityTab};
export function clientRoute(pathname:string,search=''):ClientRoute {
  if(/^\/settings\/?$/.test(pathname))return {kind:'settings'};
  if(/^\/search\/?$/.test(pathname))return {kind:'search'};
  const connections=pathname.match(/^\/profile\/(\d+)\/(followers|following)\/?$/);
  const profile=pathname.match(/^\/profile\/(\d+)\/?$/),cast=pathname.match(/^\/cast\/(\d+)\/(0x[0-9a-fA-F]{40})\/?$/);
  const fid=Number(connections?.[1]||profile?.[1]||cast?.[1]);
  if(Number.isSafeInteger(fid)&&fid>0){
    if(connections)return {kind:'connections',fid,tab:connections[2] as 'followers'|'following'};
    if(profile)return {kind:'profile',fid};
    if(cast){const tab=new URLSearchParams(search).get('tab');return {kind:'cast',fid,hash:cast[2],tab:tab==='likes'||tab==='recasts'?tab:'replies'};}
  }
  return {kind:(pathname==='/notifications'||pathname==='/notifications/')?'notifications':pathname==='/following'?'following':'home'};
}
