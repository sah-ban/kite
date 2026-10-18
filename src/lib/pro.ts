import { hub, type Config } from './hub';
export function proSubscriptionExpiry(data:unknown):number {
  const response=data as {tier_subscriptions?:unknown;tierSubscriptions?:unknown}|null;
  const tiers=response?.tier_subscriptions??response?.tierSubscriptions;
  if(!Array.isArray(tiers))throw new Error('Could not verify Farcaster Pro status.');
  let expiresAt=0;
  for(const tier of tiers){
    const type=tier?.tier_type??tier?.tierType;
    if(type!=='Pro'&&type!==1&&type!=='1')continue;
    const expiry=tier?.expires_at??tier?.expiresAt;
    if((typeof expiry!=='number'&&typeof expiry!=='string')||expiry===''||!Number.isFinite(Number(expiry))||Number(expiry)<0)throw new Error('Could not verify Farcaster Pro expiry.');
    expiresAt=Math.max(expiresAt,Number(expiry));
  }
  return expiresAt;
}
export function activeProSubscription(data:unknown,now=Date.now()/1000):boolean {
  return proSubscriptionExpiry(data)>now;
}
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
