import { hub, type Config } from './hub';
export function activeProSubscription(data:unknown,now=Date.now()/1000):boolean {
  const response=data as {tier_subscriptions?:unknown;tierSubscriptions?:unknown}|null;
  const tiers=response?.tier_subscriptions??response?.tierSubscriptions;
  if(!Array.isArray(tiers))throw new Error('Could not verify Farcaster Pro status.');
  let active=false;
  for(const tier of tiers){
    const type=tier?.tier_type??tier?.tierType;
    if(type!=='Pro'&&type!==1&&type!=='1')continue;
    const expiry=tier?.expires_at??tier?.expiresAt;
    if((typeof expiry!=='number'&&typeof expiry!=='string')||expiry===''||!Number.isFinite(Number(expiry))||Number(expiry)<0)throw new Error('Could not verify Farcaster Pro expiry.');
    if(Number(expiry)>now)active=true;
  }
  return active;
}
export async function getProStatus(config:Config,fid:number,signal?:AbortSignal):Promise<boolean> {
  return activeProSubscription(await hub(config,'storageLimitsByFid',{fid},signal));
}
