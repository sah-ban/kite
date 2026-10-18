import { fullHash, hub, HubError, onlyCastAdds, type Cast, type Config } from './hub';
import type { Reaction } from './social';

export async function readLikedCasts(config:Config,fid:number,order:'newest'|'oldest',token='',signal?:AbortSignal):Promise<{messages:Cast[];nextPageToken:string}> {
  const page=await hub<{messages:Reaction[];nextPageToken?:string}>(config,'reactionsByFid',{
    fid,reaction_type:'Like',pageSize:30,reverse:String(order==='newest'),...(token?{pageToken:token}:{}),
  },signal);
  const targets=new Map<string,{fid:number;hash:string}>();
  for(const reaction of page.messages){
    const data=reaction.data,body=data?.reactionBody,target=body?.targetCastId;
    if(data?.fid!==fid||(data.type!==3&&data.type!=='MESSAGE_TYPE_REACTION_ADD')||(body?.type!==1&&body?.type!=='REACTION_TYPE_LIKE')||!target||!Number.isSafeInteger(target.fid)||target.fid<=0||!fullHash(target.hash))continue;
    targets.set(`${target.fid}:${target.hash.toLowerCase()}`,target);
  }
  const messages:Cast[]=[],items=[...targets.values()];
  // Resolve a small batch at a time; preserve the node's reaction order.
  for(let i=0;i<items.length;i+=5){
    const casts=await Promise.all(items.slice(i,i+5).map(async target=>{
      try {
        const cast=await hub<Cast>(config,'castById',target,signal);
        return onlyCastAdds([cast]).length&&cast.data.fid===target.fid&&cast.hash.toLowerCase()===target.hash.toLowerCase()?cast:undefined;
      }catch(error){if(error instanceof HubError&&error.notFound)return;throw error;}
    }));
    messages.push(...casts.filter((cast):cast is Cast=>Boolean(cast)));
  }
  return {messages,nextPageToken:page.nextPageToken||''};
}
