// Only public values enter this ownership claim. Signer secrets stay on-device.
export function mobileClaim(origin,purpose,key,issuedAt,nonce,fid=0){
  return new TextEncoder().encode(['Kite mobile account v1',new URL(origin).origin,purpose,key.toLowerCase(),String(fid),String(issuedAt),nonce].join('\n'));
}
