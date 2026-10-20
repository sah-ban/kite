import {fullHash,hub,onlyCastAdds,type Cast,type Config} from './hub';
import type {Reaction} from './social';

export type NotificationKind='mention'|'reply'|'like'|'recast'|'follow';
export type NotificationItem={id:string;kind:NotificationKind;actor:number;timestamp:number;cast?:Cast;target?:{fid:number;hash:string};receivedAt?:string};
type ActivityTask={kind:'replies'|'reactions';cast:Cast;token:string};
export type NotificationCursor={mentions:string|null;followers:string|null;casts:string|null;activity:ActivityTask[];scanned:number};
export type NotificationPage={items:NotificationItem[];cursor:NotificationCursor;errors:string[]};
export const hasMoreNotifications=(cursor:NotificationCursor)=>cursor.mentions!==null||cursor.followers!==null||cursor.casts!==null||cursor.activity.length>0;
const validFid=(fid:unknown):fid is number=>Number.isSafeInteger(fid)&&Number(fid)>0;
const validTime=(time:unknown):time is number=>Number.isSafeInteger(time)&&Number(time)>=0&&Number(time)<=0xffffffff;
export function mergeNotifications(...pages:NotificationItem[][]):NotificationItem[]{
 const map=new Map<string,NotificationItem>();
 for(const item of pages.flat()){
  const existing=map.get(item.id);
  if(!existing||item.timestamp>existing.timestamp||item.kind==='reply')map.set(item.id,item);
 }
 return [...map.values()].sort((a,b)=>b.timestamp-a.timestamp||a.id.localeCompare(b.id));
}

export async function readNotifications(config:Config,fid:number,cursor?:NotificationCursor,signal?:AbortSignal):Promise<NotificationPage>{
 if(!validFid(fid))throw new Error('Connect an account to read notifications.');
 const previous=cursor||{mentions:'',followers:'',casts:'',activity:[],scanned:0};
 const next:NotificationCursor={...previous,activity:previous.activity.slice(30)};
 const items:NotificationItem[]=[],errors:string[]=[],newCasts:Cast[]=[];
 const recordCast=(cast:Cast,kind:'mention'|'reply')=>{
  if(validFid(cast.data.fid)&&cast.data.fid!==fid&&validTime(cast.data.timestamp)&&fullHash(cast.hash))items.push({id:`cast:${cast.data.fid}:${cast.hash.toLowerCase()}`,kind,actor:cast.data.fid,timestamp:cast.data.timestamp,cast});
 };
 async function stream(name:'mentions'|'followers'|'casts',label:string,read:()=>Promise<void>){
  if(previous[name]===null)return;
  try{await read();}catch(error){if(signal?.aborted)throw error;errors.push(label);}
 }
 await Promise.all([
  stream('mentions','Mentions',async()=>{
   const page=await hub<{messages:unknown[];nextPageToken?:string}>(config,'castsByMention',{fid,pageSize:30,reverse:'true',...(previous.mentions?{pageToken:previous.mentions}:{})},signal);
   for(const cast of onlyCastAdds(page.messages))if(cast.data.castAddBody.mentions?.includes(fid))recordCast(cast,cast.data.castAddBody.parentCastId?.fid===fid?'reply':'mention');
   next.mentions=page.nextPageToken||null;
  }),
  stream('followers','Followers',async()=>{
   const page=await hub<{messages:{hash?:string;data:{fid:number;type:string|number;timestamp:number;linkBody?:{type:string;targetFid:number}}}[];nextPageToken?:string}>(config,'linksByTargetFid',{target_fid:fid,link_type:'follow',pageSize:30,reverse:'true',...(previous.followers?{pageToken:previous.followers}:{})},signal);
   for(const {data} of page.messages)if((data?.type===5||data?.type==='MESSAGE_TYPE_LINK_ADD')&&data.linkBody?.type==='follow'&&data.linkBody.targetFid===fid&&validFid(data.fid)&&data.fid!==fid&&validTime(data.timestamp))items.push({id:`follow:${data.fid}`,kind:'follow',actor:data.fid,timestamp:data.timestamp});
   next.followers=page.nextPageToken||null;
  }),
  stream('casts','Your casts',async()=>{
   const page=await hub<{messages:Cast[];nextPageToken?:string}>(config,'castsByFid',{fid,pageSize:10,reverse:'true',...(previous.casts?{pageToken:previous.casts}:{})},signal);
   newCasts.push(...page.messages.filter(c=>c.data.fid===fid&&fullHash(c.hash)));
   next.scanned+=newCasts.length;next.casts=page.nextPageToken||null;
  }),
 ]);
 const tasks=[...previous.activity.slice(0,30),...newCasts.flatMap(cast=>[{kind:'replies' as const,cast,token:''},{kind:'reactions' as const,cast,token:''}])];
 // Keep request fanout bounded, including large accounts and paginated activity.
 for(let i=0;i<tasks.length;i+=4)await Promise.all(tasks.slice(i,i+4).map(async task=>{
  try{
   const {cast}=task;
   const page=await hub<{messages:unknown[];nextPageToken?:string}>(config,task.kind==='replies'?'castsByParent':'reactionsByCast',{
    ...(task.kind==='replies'?{fid,hash:cast.hash}:{target_fid:fid,target_hash:cast.hash}),pageSize:30,reverse:'true',...(task.token?{pageToken:task.token}:{}),
   },signal);
   if(task.kind==='replies'){
    for(const reply of onlyCastAdds(page.messages)){const parent=reply.data.castAddBody.parentCastId;if(parent?.fid===fid&&parent.hash.toLowerCase()===cast.hash.toLowerCase())recordCast(reply,'reply');}
   }else for(const message of page.messages){
    const data=(message as Partial<Reaction>)?.data;
    if(!data)continue;
    const body=data.reactionBody,target=body?.targetCastId;
    const kind=body?.type===1||body?.type==='REACTION_TYPE_LIKE'?'like':body?.type===2||body?.type==='REACTION_TYPE_RECAST'?'recast':undefined;
    if(kind&&(data?.type===3||data.type==='MESSAGE_TYPE_REACTION_ADD')&&validFid(data.fid)&&data.fid!==fid&&validTime(data.timestamp)&&target?.fid===fid&&target.hash?.toLowerCase()===cast.hash.toLowerCase())items.push({id:`${kind}:${data.fid}:${cast.hash.toLowerCase()}`,kind,actor:data.fid,timestamp:data.timestamp,cast});
   }
   if(page.nextPageToken)next.activity.push({...task,token:page.nextPageToken});
  }catch(error){if(signal?.aborted)throw error;next.activity.push(task);errors.push(task.kind==='replies'?'Replies':'Likes and recasts');}
 }));
 return {items:mergeNotifications(items),cursor:next,errors:[...new Set(errors)]};
}
