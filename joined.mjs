export function earliestFnameTimestamp(transfers,fid,now=Date.now()/1000) {
  let earliest=null;
  for(const transfer of transfers){
    const timestamp=transfer?.timestamp;
    if(transfer?.to!==fid||!Number.isSafeInteger(timestamp)||timestamp<=0||timestamp>now)continue;
    earliest=earliest===null?timestamp:Math.min(earliest,timestamp);
  }
  return earliest;
}
export function joinedDates(dependencies={}) {
  const send=dependencies.fetch||fetch,now=dependencies.now||Date.now,cache=new Map();
  async function read(fid){
    const cached=cache.get(fid);if(cached&&cached.expires>now())return cached.value;
    const entry={expires:Infinity,value:Promise.resolve(null)};
    entry.value=(async()=>{
      const deadline=now()+12_000;let fromId=0,earliest=null;
      for(let page=0;page<20;page++){
        const target=new URL('https://fnames.farcaster.xyz/transfers');target.searchParams.set('fid',String(fid));if(fromId)target.searchParams.set('from_id',String(fromId));
        const remaining=deadline-now();if(remaining<=0)throw new Error('History timed out');
        const response=await send(target,{signal:AbortSignal.timeout(Math.ceil(remaining)),redirect:'error'});
        if(!response.ok)throw new Error('History unavailable');const data=await response.json();
        if(!Array.isArray(data.transfers))throw new Error('Invalid transfer history');
        if(!data.transfers.length){entry.expires=now()+(earliest===null?300_000:3600_000);return earliest;}
        const timestamp=earliestFnameTimestamp(data.transfers,fid,now()/1000);if(timestamp!==null)earliest=earliest===null?timestamp:Math.min(earliest,timestamp);
        const ids=data.transfers.map(item=>item?.id).filter(id=>Number.isSafeInteger(id)&&id>0);
        if(!ids.length)throw new Error('Invalid history cursor');const next=Math.max(...ids)+1;if(!Number.isSafeInteger(next)||next<=fromId)throw new Error('History did not advance');fromId=next;
      }
      throw new Error('History limit reached');
    })().catch(error=>{if(cache.get(fid)===entry)cache.delete(fid);throw error;});
    cache.set(fid,entry);if(cache.size>500)cache.delete(cache.keys().next().value);return entry.value;
  }
  return async(req,res,next)=>{
    const url=new URL(req.url||'/','http://localhost');if(url.pathname!=='/api/profile/joined')return next();
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='GET')return reply(405,{error:'Use GET to read the joined date.'});
    const value=url.searchParams.get('fid')||'',fid=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(fid)||fid<=0)return reply(400,{error:'Use a positive numeric FID.'});
    try{return reply(200,{timestamp:await read(fid)});}catch{return reply(502,{error:'Joined date is unavailable.'});}
  };
}
