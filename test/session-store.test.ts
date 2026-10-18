import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rename,rm,stat,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Server-only JavaScript storage module.
import {sessionStore,SessionStorageError} from '../session-store.mjs';
const id='ab'.repeat(32);
const record=()=>({state:'active',origin:'https://client.example',expires:Date.now()+100000,key:'0x'+'11'.repeat(32),privateKey:new Uint8Array(32).fill(17),fid:123,address:'0x'+'22'.repeat(20)});

test('sessions are encrypted, private, and decryptable by a fresh store',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-sessions-'));
  try{
    const value=record();await sessionStore(dir).save(id,value);
    const files=await readdir(dir),name=files.find(name=>name.endsWith('.json'))!;
    assert.equal(files.length,2);assert.notEqual(name,id+'.json');
    const encrypted=await readFile(join(dir,name),'utf8');
    assert.ok(!encrypted.includes(Buffer.from(value.privateKey).toString('base64')));assert.ok(!encrypted.includes('privateKey'));assert.ok(!encrypted.includes('"fid"'));assert.ok(!encrypted.includes(id));
    assert.equal((await stat(dir)).mode&0o777,0o700);
    for(const name of files)assert.equal((await stat(join(dir,name))).mode&0o777,0o600);
    const restored=(await sessionStore(dir).load()).get(id);
    assert.deepEqual(restored.privateKey,value.privateKey);assert.equal(restored.fid,123);assert.equal(restored.origin,value.origin);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('queued logout wins over an in-flight save and snapshots do not share live key memory',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-sessions-'));
  try{
    const store=sessionStore(dir),value=record(),saving=store.save(id,value);value.privateKey.fill(0);await saving;
    assert.deepEqual((await sessionStore(dir).load()).get(id).privateKey,new Uint8Array(32).fill(17));
    await Promise.all([store.save(id,record()),store.remove(id)]);
    assert.equal(await store.has(id),false);assert.equal((await sessionStore(dir).load()).size,0);
    assert.ok(!(await readdir(dir)).some(name=>name.endsWith('.tmp')));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('tampered ciphertext and a missing master key fail closed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'freecast-sessions-'));
  try{
    await sessionStore(dir).save(id,record());const name=(await readdir(dir)).find(name=>name.endsWith('.json'))!;
    const path=join(dir,name),original=await readFile(path,'utf8'),envelope=JSON.parse(original);
    envelope.data=(envelope.data[0]==='A'?'B':'A')+envelope.data.slice(1);await writeFile(path,JSON.stringify(envelope),{mode:0o600});
    await assert.rejects(sessionStore(dir).load(),SessionStorageError);
    await writeFile(path,original,{mode:0o600});await unlink(join(dir,'master.key'));
    await assert.rejects(sessionStore(dir).load(),SessionStorageError);
    assert.ok(!(await readdir(dir)).includes('master.key'),'never replace the key for existing ciphertext');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('saved connections can move with their master key but cannot live in the public build',async()=>{
  const base=await mkdtemp(join(tmpdir(),'freecast-sessions-')),first=join(base,'first'),second=join(base,'second');
  try{await sessionStore(first).save(id,record());await rename(first,second);assert.equal((await sessionStore(second).load()).get(id).fid,123);assert.throws(()=>sessionStore('dist/sessions'),SessionStorageError);assert.throws(()=>sessionStore('public/sessions'),SessionStorageError);}
  finally{await rm(base,{recursive:true,force:true});}
});
