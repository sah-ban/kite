import type { ActivityTab } from './social';
// @ts-expect-error Shared JavaScript route matching also runs in the Node server.
import {parseClientRoute,isGuidePath,isEndorsementsPath,legalPagePath} from '../../routing.mjs';
export {isGuidePath,isEndorsementsPath};
export type LegalRoute='privacy'|'terms'|'community-guidelines'|'data-deletion';
export const legalPage=(pathname:string):LegalRoute|undefined=>legalPagePath(pathname);
export type ClientRoute = {kind:'home';feedFid?:number} | {kind:'following';feedFid?:number} | {kind:'notifications'} | {kind:'settings'} | {kind:'search'} | {kind:'not-found'} | {kind:'profile';fid:number} | {kind:'about';fid:number} | {kind:'connections';fid:number;tab:'followers'|'following'} | {kind:'cast';fid:number;hash:string;tab:ActivityTab};
export function clientRoute(pathname:string,search=''):ClientRoute {
  return parseClientRoute(pathname,search);
}
