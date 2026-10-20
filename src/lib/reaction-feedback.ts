import type { Page, Reaction } from './social';
import { countLabel } from './social';
import type { Cast } from './hub';
export type ReactionOverride={active:boolean;pending:boolean;startedAt?:number};
export const reactionKey=(fid:number,cast:Cast,kind:'like'|'recast')=>`${fid}:${cast.data.fid}:${cast.hash.toLowerCase()}:${kind}`;
export function reactionCount(page:Page<Reaction>|undefined,viewerFid:number|undefined,override?:ReactionOverride):string {
  if(!page||!override||!viewerFid)return countLabel(page);
  const present=page.items.some(item=>item.data.fid===viewerFid);
  const change=present===override.active?0:override.active?1:-1;
  return `${Math.max(0,page.items.length+change).toLocaleString()}${page.next?'+':''}`;
}
