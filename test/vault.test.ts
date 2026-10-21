import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAppKey, unlockAppKey, forgetAppKey, storedAccount } from '../src/lib/vault';
class MemoryStorage {
  data=new Map<string,string>();
  getItem(k:string){return this.data.get(k)||null;}
  setItem(k:string,v:string){this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
}
const storage=new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
test('app-key vault encrypts, authenticates metadata, and supports forgetting',async()=>{
  const key=new Uint8Array(32).fill(19), account={fid:37,address:'0x0000000000000000000000000000000000000001' as const,key:('0x'+'ab'.repeat(32)) as `0x${string}`};
  await saveAppKey('twelve words are not my seed',key,account);
  assert.equal(storedAccount()?.fid,37);
  const raw=storage.getItem('kite.app-key.v1')!;
  assert.ok(!raw.includes('13'.repeat(32)),'private key must not appear in plaintext');
  assert.ok(!raw.includes('twelve words are not my seed'),'passphrase must not be persisted');
  assert.deepEqual((await unlockAppKey('twelve words are not my seed')).privateKey,key);
  await assert.rejects(unlockAppKey('wrong password'),/Could not unlock/);
  const tampered=JSON.parse(raw);tampered.fid=99;storage.setItem('kite.app-key.v1',JSON.stringify(tampered));
  await assert.rejects(unlockAppKey('twelve words are not my seed'),/Could not unlock/);
  forgetAppKey();assert.equal(storedAccount(),null);
});
test('short encryption passphrases are rejected',async()=>{
  await assert.rejects(saveAppKey('short',new Uint8Array(32),{fid:37,address:'0x01',key:'0x02'}),/12 characters/);
});
