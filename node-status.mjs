import {hubUrl} from './node-config.mjs';

// Public health data is constructed explicitly; never forward the node's info body.
export function nodeStatus(config,{fetcher=fetch,now=Date.now}={}){
  let cached,expires=0,pending;
  const unavailable=()=>({available:false,syncDelaySeconds:null});
  async function load(){
    try{
      const response=await fetcher(new URL('/v1/info',hubUrl(config)),{signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok){await response.body?.cancel();return unavailable();}
      const info=await response.json();
      if(!Array.isArray(info?.shardInfos))return unavailable();
      const delays=info.shardInfos.map(shard=>shard?.blockDelay);
      const valid=delays.length>0&&delays.every(delay=>typeof delay==='number'&&Number.isFinite(delay)&&delay>=0&&delay<=Number.MAX_SAFE_INTEGER);
      return {available:true,syncDelaySeconds:valid?Math.ceil(Math.max(...delays)):null};
    }catch{return unavailable();}
  }
  return async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');res.end(JSON.stringify({error:'Method not allowed'}));return;}
    if(!cached||expires<=now()){
      if(!pending)pending=load().then(value=>{cached=value;expires=now()+5000;return value;}).finally(()=>{pending=undefined;});
      await pending;
    }
    res.statusCode=cached.available?200:503;res.end(JSON.stringify(cached));
  };
}
