/* eslint-disable react-hooks/set-state-in-effect -- These request hooks reset visible state when the request identity changes and cancel the previous request. */
import {useEffect,useRef,useState} from 'react';
import {type Cast,type Page,mergeCasts} from './model';

export function useQuery<T>(load:(signal:AbortSignal)=>Promise<T>,deps:readonly unknown[]) {
  const [value,setValue]=useState<T>(), [error,setError]=useState(''), [loading,setLoading]=useState(true), [revision,reload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setValue(undefined);setError('');setLoading(true);
    void load(controller.signal).then(value=>{if(!controller.signal.aborted)setValue(value);}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not load this page.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
    // Callers list the inputs their loader uses, as with useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[...deps,revision]);
  return {value,error,loading,reload:()=>reload(value=>value+1)};
}
export function useCastPage(load:(cursor:string,signal:AbortSignal)=>Promise<Page<Cast>>,deps:readonly unknown[]) {
  const [items,setItems]=useState<Cast[]>([]),[next,setNext]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  const controller=useRef<AbortController|null>(null),busy=useRef(false),cursor=useRef('');
  async function fetchPage(reset:boolean,refresh=false){
    if(!reset&&(busy.current||!cursor.current))return;
    if(reset)controller.current?.abort();
    const request=new AbortController();controller.current=request;busy.current=true;
    setLoading(true);setRefreshing(refresh);setError('');
    const requested=reset?'':cursor.current;
    try{
      const page=await load(requested,request.signal);
      if(request.signal.aborted)return;
      setItems(previous=>mergeCasts(reset?[]:previous,page.items));
      cursor.current=page.next===requested?'':page.next;setNext(cursor.current);
    }catch(error){if(!request.signal.aborted)setError(error instanceof Error?error.message:'Could not load casts.');}
    finally{if(controller.current===request){busy.current=false;setLoading(false);setRefreshing(false);}}
  }
  useEffect(()=>{
    setItems([]);cursor.current='';setNext('');void fetchPage(true);
    return()=>controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },deps);
  return {items,next,error,loading,refreshing,refresh:()=>void fetchPage(true,true),more:()=>void fetchPage(false),retry:()=>void fetchPage(!cursor.current)};
}
