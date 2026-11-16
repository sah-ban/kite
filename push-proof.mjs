import {mobileClaim} from './mobile-proof.mjs';
export const validPushToken=value=>typeof value==='string'&&/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(value);
export const validPushRegistration=value=>value&&/^[a-f0-9]{32}$/.test(value.installationId||'')&&validPushToken(value.token)&&typeof value.enabled==='boolean';
// Bind every mutable registration field to the device-owned signing key.
export function pushClaim(origin,key,issuedAt,nonce,fid,registration){
  const account=new TextDecoder().decode(mobileClaim(origin,'push',key,issuedAt,nonce,fid));
  return new TextEncoder().encode(account+'\n'+JSON.stringify([registration.installationId,registration.token,registration.enabled]));
}
