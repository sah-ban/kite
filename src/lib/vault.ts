import { bytesToHex, hexToBytes, type Hex } from 'viem';
import { localOrigin } from './hub';

export const STORAGE_KEY = 'kite.app-key.v1';
export const REMEMBER_KEY = 'kite.remembered-app-key.v1';
export const LOCK_KEY = 'kite.local-account-lock.v1';
export const ACCESS_CLEARED_EVENT = 'kite:local-access-cleared';
export const REMEMBER_DAYS = 30;
const DEVICE_DB = 'kite.device-unlock.v1';
export type RememberedAccess = { id: string; expiresAt: number };
export class AccountAccessChangedError extends Error {}
type Vault = { version: 1; fid: number; address: Hex; key: Hex; registration?: 'gasless'; salt: Hex; iv: Hex; ciphertext: Hex };
type Account = Pick<Vault,'fid'|'address'|'key'|'registration'>;
export type UnlockedAppKey = Account & { privateKey: Uint8Array };
type DeviceUnlock = RememberedAccess & { vault: string; unlockKey: CryptoKey };
const metadata=(v:Pick<Vault,'fid'|'address'|'key'|'registration'>)=>new TextEncoder().encode(`${v.fid}:${v.address}:${v.key}${v.registration==='gasless'?':gasless':''}`);
export const storedAccount = (): Pick<Vault,'fid'|'address'|'key'|'registration'> | null => {
  try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return v?.version === 1 ? {fid:v.fid,address:v.address,key:v.key,...(v.registration?{registration:v.registration}:{})} : null; } catch { return null; }
};
async function derive(password: string, salt: Uint8Array, usages: KeyUsage[] = ['encrypt','decrypt']): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 310_000, hash: 'SHA-256' }, material, {name:'AES-GCM',length:256},false,usages);
}
export async function saveAppKey(password: string, privateKey: Uint8Array, account: Pick<Vault,'fid'|'address'|'key'|'registration'>): Promise<void> {
  if (password.length < 12) throw new Error('Use a passphrase of at least 12 characters to encrypt your app key.');
  const salt = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password,salt);
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:metadata(account)},key,new Uint8Array(privateKey));
  await clearRememberedAppKey().catch(()=>{});
  localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,...account,salt:bytesToHex(salt),iv:bytesToHex(iv),ciphertext:bytesToHex(new Uint8Array(ciphertext))}));
}
function readVault(raw = localStorage.getItem(STORAGE_KEY)): Vault {
  const v: Vault = JSON.parse(raw || 'null');
  if (!v || v.version !== 1) throw new Error('No saved app key on this browser.');
  if(v.registration!==undefined&&v.registration!=='gasless')throw new Error('Invalid signer registration type.');
  return v;
}
async function decryptVault(v: Vault, key: CryptoKey): Promise<UnlockedAppKey> {
  const raw = await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(hexToBytes(v.iv)),additionalData:metadata(v)},key,new Uint8Array(hexToBytes(v.ciphertext)));
  return {fid:v.fid,address:v.address,key:v.key,...(v.registration?{registration:v.registration}:{}),privateKey:new Uint8Array(raw)};
}
export async function unlockAppKey(password: string): Promise<UnlockedAppKey> {
  try {
    const v = readVault();
    const key = await derive(password,hexToBytes(v.salt));
    return await decryptVault(v,key);
  } catch { throw new Error('Could not unlock this app key. Check your passphrase.'); }
}

// IndexedDB can structured-clone a non-extractable CryptoKey. Only the encrypted
// vault and a decrypt-only unlock key are stored; never a passphrase or raw signer.
function deviceStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('This browser cannot remember an app key.'));return;}
    const request=indexedDB.open(DEVICE_DB,1);
    let finished=false;
    const timeout=setTimeout(()=>{finished=true;reject(new Error('Browser key storage is unavailable.'));},5000);
    const fail=(error:unknown)=>{clearTimeout(timeout);finished=true;reject(error);};
    request.onupgradeneeded=()=>request.result.createObjectStore('keys');
    request.onerror=()=>fail(request.error);
    request.onblocked=()=>fail(new Error('Close other Kite tabs and try again.'));
    request.onsuccess=()=>{
      const db=request.result;
      if(finished){db.close();return;}
      db.onversionchange=()=>db.close();
      try{
        const tx=db.transaction('keys',mode),result=action(tx.objectStore('keys'));
        tx.oncomplete=()=>{clearTimeout(timeout);finished=true;db.close();resolve(result.result);};
        tx.onabort=tx.onerror=()=>{db.close();fail(tx.error||new Error('Could not update browser key storage.'));};
      }catch(error){db.close();fail(error);}
    };
  });
}

export function rememberedAccessCurrent(access: RememberedAccess): boolean {
  try {
    const current=JSON.parse(localStorage.getItem(REMEMBER_KEY)||'null');
    return current?.id===access.id && current.expiresAt===access.expiresAt && Number.isSafeInteger(access.expiresAt) && access.expiresAt>Date.now();
  }catch{return false;}
}

export async function clearRememberedAppKey(): Promise<void> {
  // Invalidate synchronously, including any restore currently waiting on a node.
  localStorage.removeItem(REMEMBER_KEY);
  // A fresh value broadcasts Lock even when no remember ticket is present.
  localStorage.setItem(LOCK_KEY,crypto.randomUUID());
  if(typeof window!=='undefined')window.dispatchEvent?.(new Event(ACCESS_CLEARED_EVENT));
  if(typeof indexedDB!=='undefined')await deviceStore('readwrite',store=>store.clear());
}

export async function rememberAppKey(password: string, account: Account): Promise<RememberedAccess> {
  if(!localOrigin())throw new Error('Remembering a local app key requires localhost.');
  await clearRememberedAppKey();
  const raw=localStorage.getItem(STORAGE_KEY),vault=readVault(raw);
  if(vault.fid!==account.fid||vault.key.toLowerCase()!==account.key.toLowerCase()||vault.address.toLowerCase()!==account.address.toLowerCase())throw new AccountAccessChangedError('The saved account changed. Unlock it again.');
  const access={id:bytesToHex(crypto.getRandomValues(new Uint8Array(32))),expiresAt:Date.now()+REMEMBER_DAYS*86400000};
  // The ticket also cancels an in-flight remember operation if another tab locks.
  localStorage.setItem(REMEMBER_KEY,JSON.stringify(access));
  try{
    const unlockKey=await derive(password,hexToBytes(vault.salt),['decrypt']);
    const check=await decryptVault(vault,unlockKey);
    check.privateKey.fill(0);
    await deviceStore('readwrite',store=>{
      if(!rememberedAccessCurrent(access)||localStorage.getItem(STORAGE_KEY)!==raw)throw new AccountAccessChangedError('Account access changed. Unlock it again.');
      return store.put({...access,vault:raw!,unlockKey} satisfies DeviceUnlock,access.id);
    });
    if(!rememberedAccessCurrent(access)||localStorage.getItem(STORAGE_KEY)!==raw)throw new AccountAccessChangedError('Account access changed. Unlock it again.');
    return access;
  }catch(error){
    if(rememberedAccessCurrent(access))localStorage.removeItem(REMEMBER_KEY);
    await deviceStore('readwrite',store=>store.delete(access.id)).catch(()=>{});
    throw error;
  }
}

export async function unlockRememberedAppKey(): Promise<(UnlockedAppKey & {remembered: RememberedAccess}) | null> {
  if(!localOrigin())return null;
  const ticket=localStorage.getItem(REMEMBER_KEY);
  if(!ticket)return null;
  let access: RememberedAccess | undefined;
  try{
    access=JSON.parse(ticket);
    if(!access||!rememberedAccessCurrent(access))throw new Error('Remembered access expired.');
    const record=await deviceStore<DeviceUnlock|undefined>('readonly',store=>store.get(access!.id));
    if(!record||record.id!==access.id||record.expiresAt!==access.expiresAt||record.vault!==localStorage.getItem(STORAGE_KEY)||record.unlockKey?.extractable!==false||record.unlockKey.usages.length!==1||record.unlockKey.usages[0]!=='decrypt')throw new Error('Remembered access is unavailable.');
    const saved=await decryptVault(readVault(record.vault),record.unlockKey);
    if(!rememberedAccessCurrent(access)||record.vault!==localStorage.getItem(STORAGE_KEY)){
      saved.privateKey.fill(0);
      if(localStorage.getItem(REMEMBER_KEY)===ticket)await clearRememberedAppKey().catch(()=>{});
      return null;
    }
    return {...saved,remembered:access};
  }catch{
    // Do not erase a newer connection that replaced this ticket while awaiting IDB.
    if(localStorage.getItem(REMEMBER_KEY)===ticket)await clearRememberedAppKey().catch(()=>{});
    return null;
  }
}

export function forgetAppKey(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  return clearRememberedAppKey();
}
