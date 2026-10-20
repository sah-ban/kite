import {createPool,parseFeedQuery,queryFeed,validFid} from './store.mjs';
export const feedFids=config=>(config.FREECAST_FEED_FIDS||'').split(',').filter(validFid).map(Number);
export function indexedFeed(config,{pool}={}) {
  const enabled=Boolean(config.DATABASE_URL),allowed=new Set(feedFids(config));
  if(!enabled||!allowed.size)return (req,res,next)=>next();
  pool ||= createPool(config.DATABASE_URL);
  return async(req,res,next)=>{
    const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/feed/following')return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    if(req.method!=='GET')return send(405,{error:'Method not allowed'});
    if(!validFid(url.searchParams.get('fid')))return send(400,{error:'Use a positive FID'});
    if(!allowed.has(Number(url.searchParams.get('fid'))))return send(404,{error:'Indexed feed is not enabled for this FID'});
    let query;
    try{query=parseFeedQuery(url.searchParams);}catch(error){return send(400,{error:error.message});}
    try{const page=await queryFeed(pool,query,url.searchParams.get('cursor')||'');return send(200,{...page,status:{...page.status,historyDays:Number(config.FREECAST_FEED_HISTORY_DAYS||30)}});}
    catch(error){
      if(error.message==='Feed changed or cursor is invalid. Refresh the feed.')return send(400,{error:error.message});
      return send(503,{error:'The indexed feed is temporarily unavailable. Please retry.'});
    }
  };
}
