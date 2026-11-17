import {type Cast,castKey,isFid,isHash} from './model';

export async function parentCastPage(cast:Cast,known:Cast[],resolve:(fid:string,hash:string,signal?:AbortSignal)=>Promise<Cast>,signal:AbortSignal,limit=5){
  const seen=new Set([cast,...known].map(castKey)),items:Cast[]=[];
  let parent=cast.data.castAddBody.parentCastId;
  while(parent&&items.length<limit){
    if(signal.aborted)throw new Error('Request cancelled.');
    if(!isFid(parent.fid)||!isHash(parent.hash))return {items:items.reverse(),more:false,error:'This thread has an invalid parent cast link.'};
    const key=castKey({data:{fid:parent.fid},hash:parent.hash});
    if(seen.has(key))return {items:items.reverse(),more:false,error:'This thread contains a repeated parent cast.'};
    try{
      const value=await resolve(String(parent.fid),parent.hash,signal);
      if(castKey(value)!==key)throw new Error('Unexpected parent cast.');
      seen.add(key);items.push(value);parent=value.data.castAddBody.parentCastId;
    }catch(error){
      if(signal.aborted)throw error;
      return {items:items.reverse(),more:true,error:'Couldn’t load an earlier cast. It may have been deleted or be temporarily unavailable.'};
    }
  }
  return {items:items.reverse(),more:!!parent,error:''};
}
