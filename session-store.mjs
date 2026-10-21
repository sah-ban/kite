import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {mkdir,open,readFile,readdir,rename,stat,unlink} from 'node:fs/promises';
import {resolve,join,sep,basename} from 'node:path';

const identifier=/^[a-f0-9]{64}$/;
export class SessionStorageError extends Error {
  constructor(){super('Saved signer storage is unavailable. Check the server and try again.');}
}
export function sessionStore(directory=resolve('.kite/sessions')){
  directory=resolve(directory);
  for(const publicRoot of [resolve('dist'),resolve('public')])if(directory===publicRoot||directory.startsWith(publicRoot+sep))throw new SessionStorageError();
  let key,initializing,initialized=false,queue=Promise.resolve();
  const file=id=>{if(!identifier.test(id))throw new SessionStorageError();return join(directory,createHash('sha256').update(id).digest('hex')+'.json');};
  const serial=operation=>{const result=queue.then(operation);queue=result.catch(()=>{});return result;};
  async function initialize(){
    if(initialized)return;
    initializing ||= (async()=>{
      await mkdir(directory,{recursive:true,mode:0o700});
      const info=await stat(directory);
      if(!info.isDirectory()||(info.mode&0o077)!==0)throw new SessionStorageError();
      const keyFile=join(directory,'master.key');
      try{key=await readFile(keyFile);}
      catch(error){
        if(error.code!=='ENOENT')throw error;
        if((await readdir(directory)).some(name=>/^[a-f0-9]{64}\.json$/.test(name)))throw new SessionStorageError();
        const generated=randomBytes(32);
        try{
          const handle=await open(keyFile,'wx',0o600);
          try{await handle.writeFile(generated);await handle.sync();}finally{await handle.close();}
          key=Buffer.from(generated);
        }catch(error){if(error.code!=='EEXIST')throw error;key=await readFile(keyFile);}
        finally{generated.fill(0);}
      }
      if(key.length!==32||((await stat(keyFile)).mode&0o077)!==0)throw new SessionStorageError();
      initialized=true;
    })();
    try{await initializing;}catch{key?.fill(0);key=undefined;initialized=false;initializing=undefined;throw new SessionStorageError();}
  }
  function encrypt(id,session){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(basename(file(id))));
    const plain=Buffer.from(JSON.stringify({id,state:session.state,origin:session.origin,expires:session.expires,key:session.key,privateKey:Buffer.from(session.privateKey).toString('base64'),...(session.state==='active'?{fid:session.fid,address:session.address}:{token:session.token,deepLinkUrl:session.deepLinkUrl})}));
    try{const data=Buffer.concat([cipher.update(plain),cipher.final()]);return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});}
    finally{plain.fill(0);}
  }
  function decrypt(path,encrypted){
    const envelope=JSON.parse(encrypted);
    if(envelope.version!==1)throw new SessionStorageError();
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
    decipher.setAAD(Buffer.from(basename(path)));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const plain=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);
    let privateKey;
    try{
      const data=JSON.parse(plain.toString());privateKey=Buffer.from(data.privateKey,'base64');
      if(!identifier.test(data.id)||file(data.id)!==path||privateKey.length!==32||!/^0x[a-fA-F0-9]{64}$/.test(data.key)||!Number.isSafeInteger(data.expires)||!['pending','active'].includes(data.state)||typeof data.origin!=='string')throw new SessionStorageError();
      if(data.state==='active'&&(!Number.isSafeInteger(data.fid)||data.fid<=0||!/^0x[a-fA-F0-9]{40}$/.test(data.address)))throw new SessionStorageError();
      if(data.state==='pending'&&(typeof data.token!=='string'||typeof data.deepLinkUrl!=='string'))throw new SessionStorageError();
      return [data.id,{...data,privateKey:new Uint8Array(privateKey),lastPoll:0}];
    }finally{privateKey?.fill(0);plain.fill(0);}
  }
  return {
    async load(){
      try{
        await initialize();const result=new Map();
        for(const name of await readdir(directory)){
          if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
          const path=join(directory,name);
          if(((await stat(path)).mode&0o077)!==0)throw new SessionStorageError();
          const [id,session]=decrypt(path,await readFile(path,'utf8'));result.set(id,session);
        }
        return result;
      }catch{throw new SessionStorageError();}
    },
    async save(id,session){
      const snapshot={...session,privateKey:new Uint8Array(session.privateKey)};
      try{
        // Enqueue immediately so a later logout always runs after this save.
        await serial(async()=>{
          await initialize();
          const encrypted=encrypt(id,snapshot),path=file(id),temporary=path+'.'+randomBytes(8).toString('hex')+'.tmp';
          try{
            const handle=await open(temporary,'wx',0o600);
            try{await handle.writeFile(encrypted);await handle.sync();}finally{await handle.close();}
            await rename(temporary,path);
            const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}
          }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
        });
      }catch{throw new SessionStorageError();}finally{snapshot.privateKey.fill(0);}
    },
    async remove(id){
      try{await serial(async()=>{await initialize();await unlink(file(id)).catch(error=>{if(error.code!=='ENOENT')throw error;});const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}});}catch{throw new SessionStorageError();}
    },
    async has(id){
      try{await initialize();await stat(file(id));return true;}catch(error){if(error.code==='ENOENT')return false;throw new SessionStorageError();}
    },
  };
}
