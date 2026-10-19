import { hub, type Config } from './hub';
// @ts-expect-error Shared subscription parser for browser and signing server.
import { proSubscriptionExpiry, activeProSubscription } from '../../pro-subscription.mjs';
export { proSubscriptionExpiry, activeProSubscription };
export async function getProStatus(config:Config,fid:number,signal?:AbortSignal):Promise<boolean> {
  return activeProSubscription(await hub(config,'storageLimitsByFid',{fid},signal));
}


const badgeCache=new Map<string,{expires:number;value:Promise<number>}>();
let pendingRequests=0;
const queue:(()=>void)[]=[];
export function cachedProExpiry(config:Config,fid:number):Promise<number> {
  const key=JSON.stringify([config.readUrl,Boolean(config.useGateway),fid]);
  const cached=badgeCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
  const entry={expires:Infinity,value:Promise.resolve(0)};
  entry.value=(async()=>{
    if(pendingRequests>=4)await new Promise<void>(resolve=>queue.push(resolve));else pendingRequests++;
    try{
      const expiry=proSubscriptionExpiry(await hub(config,'storageLimitsByFid',{fid}));entry.expires=Date.now()+300_000;return expiry;
    }catch(error){entry.expires=Date.now()+5000;throw error;}
    finally{const next=queue.shift();if(next)next();else pendingRequests--;}
  })();
  badgeCache.set(key,entry);if(badgeCache.size>500)badgeCache.delete(badgeCache.keys().next().value!);return entry.value;
}

export function proExpiryLabel(expiresAt:number,now=Date.now()):string {
  const end=new Date(expiresAt*1000),start=new Date(now);
  if(!Number.isFinite(end.getTime())||end.getTime()<=now)return 'Subscription expired';
  let months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth();
  const addMonths=(count:number)=>{
    const date=new Date(now);date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+count);
    const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(start.getUTCDate(),lastDay));return date.getTime();
  };
  if(addMonths(months)>end.getTime())months--;
  const days=Math.floor((end.getTime()-addMonths(months))/86_400_000);
  if(!months&&!days)return 'Expires in less than 1 day';
  return `Expires in ${months} month${months===1?'':'s'} ${days} day${days===1?'':'s'}`;
}
