export function profileCounts(dependencies={}) {
  const send=dependencies.fetch||fetch,now=dependencies.now||Date.now,cache=new Map();
  async function read(fid){
    const saved=cache.get(fid);if(saved&&saved.expires>now())return saved.value;
    const entry={expires:Infinity,value:undefined};
    entry.value=(async()=>{
      const target=new URL('https://api.farcaster.xyz/v2/user');target.searchParams.set('fid',String(fid));
      const response=await send(target,{signal:AbortSignal.timeout(12_000),redirect:'error'});
      if(!response.ok)throw new Error('Counts unavailable');
      const user=(await response.json())?.result?.user;
      if(user?.fid!==fid||![user.followerCount,user.followingCount].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error('Invalid counts');
      entry.expires=now()+60_000;
      return {fid,followerCount:user.followerCount,followingCount:user.followingCount};
    })().catch(error=>{if(cache.get(fid)===entry)cache.delete(fid);throw error;});
    cache.set(fid,entry);if(cache.size>500)cache.delete(cache.keys().next().value);return entry.value;
  }
  return async(req,res,next)=>{
    const url=new URL(req.url||'/','http://localhost');if(url.pathname!=='/api/profile/counts')return next();
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='GET')return reply(405,{error:'Use GET to read profile counts.'});
    const value=url.searchParams.get('fid')||'',fid=Number(value);
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(fid)||fid<=0)return reply(400,{error:'Use a positive numeric FID.'});
    try{return reply(200,await read(fid));}catch{return reply(502,{error:'Profile counts are unavailable.'});}
  };
}
