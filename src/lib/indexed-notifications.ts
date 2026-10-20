import {useEffect,useState} from 'react';
import type {NotificationItem,NotificationKind} from './notifications';
export type IndexedNotificationPage={items:NotificationItem[];nextPageToken:string;unread:number;serverTime:string;startedAt:string|null;workerOnline:boolean;historyDays:number};
const key=(fid:number)=>`kite:notifications:seen:${fid}`;
const memorySeen=new Map<number,string>();
export function notificationsSeen(fid:number){
 let saved='';try{saved=localStorage.getItem(key(fid))||'';}catch{/* Use the in-memory read marker when storage is unavailable. */}
 const memory=memorySeen.get(fid)||'1970-01-01T00:00:00.000Z';
 return saved.length<=40&&Date.parse(saved)>Date.parse(memory)?saved:memory;
}
export function markNotificationsSeen(fid:number,time:string){
 if(!Number.isFinite(Date.parse(time)))return;
 if(Date.parse(time)>Date.parse(notificationsSeen(fid))){memorySeen.set(fid,time);try{localStorage.setItem(key(fid),time);}catch{/* Keep the in-memory read marker. */}}
 window.dispatchEvent(new CustomEvent('kite:notifications-read',{detail:{fid}}));
}
export async function indexedNotifications(fid:number,{kind='all',cursor='',summary=false,signal}:{kind?:NotificationKind|'all';cursor?:string;summary?:boolean;signal?:AbortSignal}={}):Promise<IndexedNotificationPage>{
 const params=new URLSearchParams({fid:String(fid),kind,since:notificationsSeen(fid),...(cursor?{cursor}:{}),...(summary?{summary:'true'}:{})});
 const response=await fetch('/api/feed/notifications?'+params,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load notifications.');return body;
}
export function useNotificationUnread(fid:number|undefined,enabled:boolean){
 const [state,setState]=useState({fid:0,count:0});
 useEffect(()=>{
  if(!fid||!enabled)return;
  const controller=new AbortController();let pending=false;
  async function poll(){
   if(pending||document.visibilityState==='hidden')return;pending=true;
   const seen=notificationsSeen(fid!);
   try{const page=await indexedNotifications(fid!,{summary:true,signal:controller.signal});if(!controller.signal.aborted&&seen===notificationsSeen(fid!))setState({fid:fid!,count:page.unread});}catch{/* Keep the last count during a temporary outage. */}finally{pending=false;}
  }
  const read=(event:Event)=>{if((event as CustomEvent).detail?.fid===fid){setState({fid,count:0});void poll();}};
  const storage=(event:StorageEvent)=>{if(event.key===key(fid))void poll();};
  void poll();const timer=setInterval(()=>void poll(),10000);
  window.addEventListener('kite:notifications-read',read);window.addEventListener('storage',storage);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('kite:notifications-read',read);window.removeEventListener('storage',storage);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);};
 },[fid,enabled]);
 return enabled&&state.fid===fid?state.count:0;
}
