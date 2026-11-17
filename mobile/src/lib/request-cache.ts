// Share read requests without letting one disappearing row cancel other readers.
// Only successful results are cached, with a bounded number of retained entries.
export function createRequestCache<K,V>(limit:number,ttl:number,now=Date.now){
  type Entry={controller:AbortController;value:Promise<V>;expires:number;settled:boolean;readers:number};
  const entries=new Map<K,Entry>();
  return (key:K,load:(signal:AbortSignal)=>Promise<V>,signal?:AbortSignal):Promise<V>=>{
    signal?.throwIfAborted();
    let entry=entries.get(key);
    if(entry&&entry.expires<=now()){entries.delete(key);entry=undefined;}
    if(!entry){
      const fresh:Entry={controller:new AbortController(),value:undefined!,expires:Infinity,settled:false,readers:0};
      fresh.value=Promise.resolve().then(()=>{fresh.controller.signal.throwIfAborted();return load(fresh.controller.signal);}).then(value=>{
        fresh.settled=true;fresh.expires=now()+ttl;return value;
      },error=>{fresh.settled=true;if(entries.get(key)===fresh)entries.delete(key);throw error;});
      entry=fresh;
    }
    // Refresh recency so frequently reused previews survive cache pressure.
    entries.delete(key);entries.set(key,entry);
    if(entries.size>limit)entries.delete(entries.keys().next().value!);
    const current=entry;current.readers++;
    return new Promise<V>((resolve,reject)=>{
      let released=false;
      const release=()=>{
        if(released)return;released=true;signal?.removeEventListener('abort',cancel);current.readers--;
        if(!current.settled&&!current.readers){current.controller.abort();if(entries.get(key)===current)entries.delete(key);}
      };
      const cancel=()=>{release();reject(signal?.reason||new Error('Request cancelled.'));};
      signal?.addEventListener('abort',cancel,{once:true});
      current.value.then(value=>{if(!released){release();resolve(value);}},error=>{if(!released){release();reject(error);}});
    });
  };
}
