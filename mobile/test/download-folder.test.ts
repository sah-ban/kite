import test from 'node:test';
import assert from 'node:assert/strict';
import {createDownloadFolder,DOWNLOAD_FOLDER_KEY,isKiteDownloadFolder} from '../src/lib/download-folder';
import {ImageSaveCancelledError} from '../src/lib/download-image-core';
const uri='content://com.android.externalstorage.documents/tree/primary%3ADownload%2FKite';
function storage(){const values=new Map<string,string>();return {values,getItem:async(key:string)=>values.get(key)||null,setItem:async(key:string,value:string)=>{values.set(key,value);},removeItem:async(key:string)=>{values.delete(key);}};}

test('only the Kite subfolder of internal Downloads is accepted',()=>{
  assert.equal(isKiteDownloadFolder(uri),true);
  for(const value of ['file:///storage/emulated/0/Download/Kite','content://com.android.externalstorage.documents/tree/primary%3ADownload','content://com.android.externalstorage.documents/tree/primary%3ADCIM%2FKite','content://evil.example/tree/primary%3ADownload%2FKite'])assert.equal(isKiteDownloadFolder(value),false);
});
test('folder selection is coalesced, persisted and reused after restarting',async()=>{
  const store=storage();let picks=0;
  const io={exists:async()=>true,pick:async()=>{picks++;return uri;}};
  const folder=createDownloadFolder(store,io);
  assert.deepEqual(await Promise.all([folder(),folder()]),[uri,uri]);assert.equal(picks,1);assert.equal(store.values.get(DOWNLOAD_FOLDER_KEY),uri);
  assert.equal(await createDownloadFolder(store,io)(),uri);assert.equal(picks,1);
});
test('revoked/deleted folders are selected again; cancelling or choosing another folder does not save access',async()=>{
  const store=storage();store.values.set(DOWNLOAD_FOLDER_KEY,uri);let readable=false,picks=0;
  const folder=createDownloadFolder(store,{exists:async()=>readable,pick:async()=>{picks++;readable=true;return uri;}});
  assert.equal(await folder(),uri);assert.equal(picks,1);
  const cancelled=storage();await assert.rejects(createDownloadFolder(cancelled,{exists:async()=>true,pick:async()=>null})(),ImageSaveCancelledError);assert.equal(cancelled.values.size,0);
  await assert.rejects(createDownloadFolder(cancelled,{exists:async()=>true,pick:async()=>uri.replace('Download','Pictures')})(),/Select Internal storage/);assert.equal(cancelled.values.size,0);
});
