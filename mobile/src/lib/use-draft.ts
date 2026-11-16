import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect,useRef,useState} from 'react';
import {type Draft,emptyDraft,makeDraftStore} from './composer';

export function useSavedDraft(key:string,initial:Draft=emptyDraft(),preferInitial=false){
  const [store]=useState(()=>makeDraftStore(AsyncStorage,key,initial));
  const [draft,setDraft]=useState<Draft>(emptyDraft),[ready,setReady]=useState(false),[error,setError]=useState('');
  const latest=useRef<Draft>(emptyDraft()),loaded=useRef(false);
  useEffect(()=>{
    let active=true;
    void store.load(preferInitial).then(value=>{if(active){latest.current=value;loaded.current=true;setDraft(value);setReady(true);}}).catch(()=>{if(active){setReady(true);setError('Could not restore your saved draft.');}});
    return()=>{active=false;if(loaded.current)void store.save(latest.current).catch(()=>{});};
  },[store,preferInitial]);
  useEffect(()=>{
    if(!ready||!loaded.current)return;
    const timer=setTimeout(()=>void store.save(draft).catch(()=>setError('Could not save this draft on your device.')),350);
    return()=>clearTimeout(timer);
  },[draft,ready,store]);
  function update(change:Draft|((previous:Draft)=>Draft)){const next=typeof change==='function'?change(latest.current):change;loaded.current=true;latest.current=next;setDraft(next);}
  async function clear(){await store.clear();latest.current=emptyDraft();setDraft(latest.current);}
  async function save(){await store.save(latest.current);setError('');}
  return {draft,ready,error,update,save,clear};
}
