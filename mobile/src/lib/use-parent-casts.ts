import {useEffect,useRef,useState} from 'react';
import {useApp} from './state';
import type {Cast} from './model';
import {parentCastPage} from './parent-casts';

export function useParentCasts(cast:Cast){
  const {api}=useApp();
  const [items,setItems]=useState<Cast[]>([]),[more,setMore]=useState(!!cast.data.castAddBody.parentCastId),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const saved=useRef<Cast[]>([]),pending=useRef<AbortController|null>(null),active=useRef(false);
  async function load(){
    if(pending.current||!active.current)return;
    const controller=new AbortController();pending.current=controller;setLoading(true);setError('');
    try{
      const page=await parentCastPage(saved.current[0]||cast,[cast,...saved.current],api.resolveCast,controller.signal);
      if(controller.signal.aborted)return;
      saved.current=[...page.items,...saved.current];setItems(saved.current);setMore(page.more);setError(page.error);
    }catch{if(!controller.signal.aborted)setError('Couldn’t load earlier casts. Please try again.');}
    finally{if(pending.current===controller){pending.current=null;if(active.current)setLoading(false);}}
  }
  useEffect(()=>{
    active.current=true;if(cast.data.castAddBody.parentCastId)void load();
    return()=>{active.current=false;pending.current?.abort();pending.current=null;};
    // The conversation keys this hook by the selected cast and server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return {items,more,error,loading,load:()=>void load(),nearTop:()=>{if(more&&!error)void load();}};
}
