import {createPool,enrollViewer,parseFeedQuery,queryFeed,validFid} from './store.mjs';
import {localFeedEnrollment} from './enrollment.mjs';
export const feedFids=config=>(config.FREECAST_FEED_FIDS||'').split(',').filter(validFid).map(Number);
export function indexedFeed(config,{pool,...dependencies}={}) {
  if(!config.DATABASE_URL)return (req,res,next)=>next();
  const seeds=new Set(feedFids(config)),maxUsers=Number(config.FREECAST_FEED_MAX_USERS||1000);
  if(!Number.isInteger(maxUsers)||maxUsers<1||maxUsers>10000)throw new Error('Invalid feed enrollment capacity');
  pool ||= createPool(config.DATABASE_URL);
  const enroll=fid=>enrollViewer(pool,fid,{maxUsers});
  const prove=localFeedEnrollment(config,enroll,dependencies);
  const middleware=async(req,res,next)=>{
    const url=new URL(req.url,'http://localhost');
    if(!['/api/feed/following','/api/feed/enrollment','/api/feed/challenge','/api/feed/enroll'].includes(url.pathname))return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const send=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    try{
      if(url.pathname==='/api/feed/challenge'||url.pathname==='/api/feed/enroll')return send(200,await prove(req,res,url));
      if(req.method!=='GET')return send(405,{error:'Method not allowed'});
      const fid=Number(url.searchParams.get('fid'));if(!validFid(fid))return send(400,{error:'Use a positive FID'});
      let query;if(url.pathname==='/api/feed/following')try{query=parseFeedQuery(url.searchParams);}catch(error){return send(400,{error:error.message});}
      const enrolled=seeds.has(fid)||(await pool.query('SELECT fid FROM freecast_feed_users WHERE fid=$1',[fid])).rows.length>0;
      if(url.pathname==='/api/feed/enrollment')return send(200,{enrolled,fid});
      if(!enrolled)return send(404,{error:'Connect this account to enable its indexed feed'});
      const page=await queryFeed(pool,query,url.searchParams.get('cursor')||'');return send(200,{...page,status:{...page.status,historyDays:Number(config.FREECAST_FEED_HISTORY_DAYS||30)}});
    }catch(error){
      if(error.status)return send(error.status,{error:error.message});
      if(error.message==='Feed changed or cursor is invalid. Refresh the feed.')return send(400,{error:error.message});
      return send(503,{error:'The indexed feed is temporarily unavailable. Please retry.'});
    }
  };
  middleware.enroll=enroll;return middleware;
}
