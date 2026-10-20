import { proSubscriptionExpiry } from './pro';

export type StorageLimit={key:string;label:string;used:number;limit:number};
export type ProfileStorageData={units?:number;limits:StorageLimit[];proExpiry?:number};
const labels:Record<string,string>={casts:'Casts',links:'Links',reactions:'Reactions (likes/recasts)',userdata:'Profile data',verifications:'Wallet verifications',usernameproofs:'Username proofs',storagelends:'Storage lends'};
const storeTypes=['','casts','links','reactions','userdata','verifications','usernameproofs'];
function nonnegativeInteger(value:unknown):number|undefined {
  if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return;
  const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:undefined;
}
export function parseProfileStorage(value:unknown):ProfileStorageData {
  if(!value||typeof value!=='object')throw new Error('Invalid storage response.');
  const data=value as {units?:unknown;limits?:unknown};
  if(data.limits!==undefined&&!Array.isArray(data.limits))throw new Error('Invalid storage limits.');
  const limits=new Map<string,StorageLimit>();
  for(const entry of (data.limits||[]) as unknown[]){
    if(!entry||typeof entry!=='object')continue;
    const row=entry as {name?:unknown;storeType?:unknown;used?:unknown;limit?:unknown};
    const keys=[row.name,row.storeType].map(type=>typeof type==='number'?storeTypes[type]||'':typeof type==='string'?type.replace(/^STORE_TYPE_/,'').replace(/[^a-z]/gi,'').toLowerCase():'');
    const key=keys.find(key=>labels[key]),used=nonnegativeInteger(row.used),limit=nonnegativeInteger(row.limit);
    if(key&&used!==undefined&&limit!==undefined)limits.set(key,{key,label:labels[key],used,limit});
  }
  let proExpiry:number|undefined;
  try{const expiry=proSubscriptionExpiry(value);if(Number.isFinite(new Date(expiry*1000).getTime()))proExpiry=expiry;}catch{/* Storage usage remains useful if subscription metadata is unavailable. */}
  return {units:nonnegativeInteger(data.units),limits:[...limits.values()],proExpiry};
}
