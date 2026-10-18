import { bytesToHex, hexToBytes, type Hex } from 'viem';

const STORAGE_KEY = 'freecast.app-key.v1';
type Vault = { version: 1; fid: number; address: Hex; key: Hex; registration?: 'gasless'; salt: Hex; iv: Hex; ciphertext: Hex };
const metadata=(v:Pick<Vault,'fid'|'address'|'key'|'registration'>)=>new TextEncoder().encode(`${v.fid}:${v.address}:${v.key}${v.registration==='gasless'?':gasless':''}`);
export const storedAccount = (): Pick<Vault,'fid'|'address'|'key'|'registration'> | null => {
  try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return v?.version === 1 ? {fid:v.fid,address:v.address,key:v.key,...(v.registration?{registration:v.registration}:{})} : null; } catch { return null; }
};
async function derive(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 310_000, hash: 'SHA-256' }, material, {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function saveAppKey(password: string, privateKey: Uint8Array, account: Pick<Vault,'fid'|'address'|'key'|'registration'>): Promise<void> {
  if (password.length < 12) throw new Error('Use a passphrase of at least 12 characters to encrypt your app key.');
  const salt = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password,salt);
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:metadata(account)},key,new Uint8Array(privateKey));
  localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,...account,salt:bytesToHex(salt),iv:bytesToHex(iv),ciphertext:bytesToHex(new Uint8Array(ciphertext))}));
}
export async function unlockAppKey(password: string): Promise<{ fid: number; address: Hex; key: Hex; registration?: 'gasless'; privateKey: Uint8Array }> {
  const v: Vault = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (!v || v.version !== 1) throw new Error('No saved app key on this browser.');
  try {
    if(v.registration!==undefined&&v.registration!=='gasless')throw new Error('Invalid signer registration type.');
    const key = await derive(password,hexToBytes(v.salt));
    const raw = await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(hexToBytes(v.iv)),additionalData:metadata(v)},key,new Uint8Array(hexToBytes(v.ciphertext)));
    return {...v,privateKey:new Uint8Array(raw)};
  } catch { throw new Error('Could not unlock this app key. Check your passphrase.'); }
}
export function forgetAppKey() { localStorage.removeItem(STORAGE_KEY); }
