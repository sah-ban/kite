// Shared by the client router and production server so page status stays consistent.
export const isGuidePath=pathname=>/^\/guide\/?$/.test(pathname);
export const isEndorsementsPath=pathname=>/^\/endorsements\/?$/.test(pathname);
export function parseClientRoute(pathname,search=''){
  if(/^\/settings\/?$/.test(pathname))return {kind:'settings'};
  if(/^\/search\/?$/.test(pathname))return {kind:'search'};
  if(/^\/notifications\/?$/.test(pathname))return {kind:'notifications'};
  const connections=pathname.match(/^\/profile\/(\d+)\/(followers|following)\/?$/);
  const about=pathname.match(/^\/profile\/(\d+)\/about\/?$/);
  const profile=pathname.match(/^\/profile\/(\d+)\/?$/),cast=pathname.match(/^\/cast\/(\d+)\/(0x[0-9a-fA-F]{40})\/?$/);
  const fid=Number(connections?.[1]||about?.[1]||profile?.[1]||cast?.[1]);
  if(Number.isSafeInteger(fid)&&fid>0){
    if(about)return {kind:'about',fid};
    if(connections)return {kind:'connections',fid,tab:connections[2]};
    if(profile)return {kind:'profile',fid};
    if(cast){const tab=new URLSearchParams(search).get('tab');return {kind:'cast',fid,hash:cast[2],tab:tab==='likes'||tab==='recasts'?tab:'replies'};}
  }
  const following=/^\/following\/?$/.test(pathname);
  if(!following&&!['/','/client','/client/','/index.html'].includes(pathname))return {kind:'not-found'};
  const selected=new URLSearchParams(search).get('fid');
  const feedFid=selected&&/^\d+$/.test(selected)&&Number.isSafeInteger(Number(selected))&&Number(selected)>0?Number(selected):undefined;
  return {...(feedFid?{feedFid}:{}),kind:following?'following':'home'};
}
export const isPagePath=pathname=>isGuidePath(pathname)||isEndorsementsPath(pathname)||parseClientRoute(pathname).kind!=='not-found';
