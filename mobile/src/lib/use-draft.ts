import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect,useRef,useState} from 'react';
import {type Draft,emptyDraft,makeDraftStore} from './composer';

export function useSavedDraft(key:string){
  const [store]=useState(()=>makeDraftStore(AsyncStorage,key));
  const [draft,setDraft]=useState<Draft>(emptyDraft),[ready,setReady]=useState(false),[error,setError]=useState('');
  const latest=useRef<Draft>(emptyDraft()),loaded=useRef(false);
  useEffect(()=>{
    let active=true;
    void store.load().then(value=>{if(active){latest.current=value;loaded.current=true;setDraft(value);setReady(true);}}).catch(()=>{if(active){loaded.current=true;setReady(true);setError('Could not restore your saved draft.');}});
    return()=>{active=false;if(loaded.current)void store.save(latest.current).catch(()=>{});};
  },[store]);
  useEffect(()=>{
    if(!ready)return;
    const timer=setTimeout(()=>void store.save(draft).catch(()=>setError('Could not save this draft on your device.')),350);
    return()=>clearTimeout(timer);
  },[draft,ready,store]);
  function update(change:Draft|((previous:Draft)=>Draft)){const next=typeof change==='function'?change(latest.current):change;latest.current=next;setDraft(next);}
  async function clear(){latest.current=emptyDraft();await store.clear();setDraft(latest.current);}
  return {draft,ready,error,update,clear};
}
