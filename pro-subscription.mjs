export function proSubscriptionExpiry(data) {
  const response=data;
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
export function activeProSubscription(data,now=Date.now()/1000) {
  return proSubscriptionExpiry(data)>now;
}
