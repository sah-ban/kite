import AsyncStorage from '@react-native-async-storage/async-storage';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState} from 'react-native';
import {indexedNotifications} from './notifications';
import {useApp} from './state';

type NotificationState={mode:'loading'|'indexed'|'legacy'|'error';error:string;unread:number;since:()=>string;markSeen:(time:string)=>void;retry:()=>void};
const Context=createContext<NotificationState|null>(null);
export function NotificationProvider({children}:{children:ReactNode}){
  const {api,account,enrollNotifications}=useApp(),fid=account.session?.fid;
  const [mode,setMode]=useState<NotificationState['mode']>(fid?'loading':'legacy'),[error,setError]=useState(''),[unread,setUnread]=useState(0),[revision,setRevision]=useState(0);
  const seen=useRef('1970-01-01T00:00:00.000Z'),writes=useRef(Promise.resolve());
  const key=`kite.mobile.notifications.seen:${api.origin}:${fid}`;
  const since=useCallback(()=>seen.current,[]);
  const markSeen=useCallback((time:string)=>{
    if(!Number.isFinite(Date.parse(time))||Date.parse(time)<=Date.parse(seen.current))return;
    seen.current=time;setUnread(0);
    writes.current=writes.current.then(()=>AsyncStorage.setItem(key,time)).catch(()=>{/* Retain the in-memory marker. */});
  },[key]);
  useEffect(()=>{
    const controller=new AbortController();
    async function setup(){
      try{
        const saved=await AsyncStorage.getItem(key).catch(()=>null);
        if(controller.signal.aborted)return;
        if(saved&&Number.isFinite(Date.parse(saved))&&Date.parse(saved)>Date.parse(seen.current))seen.current=saved;
        const config=await api.config(controller.signal);
        if(controller.signal.aborted)return;
        if(config.indexedFeedEnabled&&fid){
          const state=await api.request<{enrolled:boolean}>('/api/feed/enrollment',{fid},controller.signal);
          if(!state.enrolled&&!controller.signal.aborted)await enrollNotifications();
        }
        if(!controller.signal.aborted){setMode(config.indexedFeedEnabled?'indexed':'legacy');setError('');}
      }catch(error){if(!controller.signal.aborted){setMode('error');setError(error instanceof Error?error.message:'Could not prepare notifications.');}}
    }
    if(fid)void setup();
    return()=>controller.abort();
  },[api,fid,key,enrollNotifications,revision]);
  useEffect(()=>{
    if(mode!=='indexed'||!fid)return;
    const controller=new AbortController();let pending=false;
    async function poll(){
      if(pending||AppState.currentState!=='active')return;pending=true;
      const before=seen.current;
      try{const page=await indexedNotifications(api,fid!,{summary:true,since:before,signal:controller.signal});if(!controller.signal.aborted&&before===seen.current)setUnread(page.unread);}
      catch{/* Keep the previous count during an outage. */}finally{pending=false;}
    }
    void poll();const timer=setInterval(()=>void poll(),10000),listener=AppState.addEventListener('change',state=>{if(state==='active')void poll();});
    return()=>{controller.abort();clearInterval(timer);listener.remove();};
  },[api,fid,mode]);
  return <Context.Provider value={{mode,error,unread,since,markSeen,retry:()=>{setMode('loading');setRevision(value=>value+1);}}}>{children}</Context.Provider>;
}
export function useNotifications(){const value=useContext(Context);if(!value)throw new Error('NotificationProvider is missing.');return value;}
